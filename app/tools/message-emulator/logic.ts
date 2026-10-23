// Message emulator: build an unsigned wallet transfer or take a signed external message, run it through
// toncenter's emulator (POST /api/emulate/v1/emulateTrace) on the current chain state, and summarize the trace.
import type { MessageRelaxed } from '@ton/core'
import { Address, beginCell, Cell, external, internal, loadMessage, SendMode, storeMessage } from '@ton/core'
import { WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import type { TonNetwork } from '~/composables/useTonNetwork'
import { balanceChange, txFromV3, txOutcome, type TxView, type V3Tx } from '~/lib/tx-dev/txview'
import { describeExitCode } from '~/lib/tx-dev/exitCodes'
import { COIN_SYMBOL } from '~/utils/currency'
import { messageHash, normalizedExtMessageHash, parseBoc } from '~/utils/ton/messages'
import { detectWalletVersion, NETWORK_GLOBAL_ID } from '~/utils/ton/wallets'

// ---------------------------------------------------------------- wallet state

export type BuildableVersion = 'v3r2' | 'v4r2' | 'v5r1'

export interface WalletState {
  version: BuildableVersion
  label: string
  address: Address
  seqno: number
  /** Raw 32-bit wallet_id / subwallet_id as stored in the contract data. */
  walletId: number
  publicKey: Buffer
}

/**
 * Reads seqno / wallet id / public key from a wallet's code + data (toncenter v3 /account).
 * Supports W5 (v5R1), v4R2 and v3R2, the wallets almost everyone uses. The address is not rebuilt from code + data:
 * old or custom deployments have a different StateInit, but their transfer body only depends on these fields.
 */
export function walletFromState(address: string, codeB64: string | null | undefined, dataB64: string | null | undefined): WalletState {
  if (!codeB64 || !dataB64) throw new Error('This address has no deployed contract yet. Only active wallets can be simulated.')
  const addr = Address.parse(address)
  const kind = detectWalletVersion(Cell.fromBase64(codeB64).hash().toString('base64'))
  if (!kind) throw new Error('This address is not a standard wallet. Paste a signed external message in the other tab instead.')
  const s = Cell.fromBase64(dataB64).beginParse()
  let w: WalletState
  if (kind.version === 'v5r1') {
    if (!s.loadBit()) throw new Error('Signature authentication is disabled on this W5 wallet (extension-only mode).')
    const seqno = s.loadUint(32)
    const walletId = s.loadUint(32)
    const publicKey = s.loadBuffer(32)
    w = { version: 'v5r1', label: kind.label, address: addr, seqno, walletId, publicKey }
  }
  else if (kind.version === 'v4r2' || kind.version === 'v3r2') {
    const seqno = s.loadUint(32)
    const walletId = s.loadUint(32)
    const publicKey = s.loadBuffer(32)
    w = { version: kind.version, label: kind.label, address: addr, seqno, walletId, publicKey }
  }
  else {
    throw new Error(`${kind.label} is not supported by the builder. Supported: W5 (v5R1), v4R2, v3R2. Paste a signed message instead.`)
  }
  return w
}

/** W5 contract object for a raw stored wallet_id (decodes the network-xored context, see WalletV5R1WalletId). */
function v5(w: Pick<WalletState, 'walletId' | 'publicKey' | 'address'>, network: TonNetwork) {
  const networkGlobalId = NETWORK_GLOBAL_ID[network]
  const cs = beginCell().storeInt((w.walletId | 0) ^ networkGlobalId, 32).endCell().beginParse()
  const workchain = w.address.workChain
  if (!cs.loadBit()) return WalletContractV5R1.create({ workchain, publicKey: w.publicKey, walletId: { networkGlobalId, context: cs.loadUint(31) } })
  const wc = cs.loadInt(8)
  cs.loadUint(8) // wallet version, 0 = v5r1
  const subwalletNumber = cs.loadUint(15)
  return WalletContractV5R1.create({ publicKey: w.publicKey, walletId: { networkGlobalId, context: { walletVersion: 'v5r1', workchain: wc, subwalletNumber } } })
}

const ZERO_SIGNATURE = async () => Buffer.alloc(64)

/**
 * The external message body a wallet app would sign, with a zero signature (emulate with ignore_chksig).
 * Send mode 3 (pay fees separately + ignore errors), what wallet apps use.
 */
export async function unsignedTransferBody(w: WalletState, p: { messages: MessageRelaxed[], validUntil: number, seqno?: number, network: TonNetwork }): Promise<Cell> {
  const args = { seqno: p.seqno ?? w.seqno, signer: ZERO_SIGNATURE, messages: p.messages, sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS, timeout: p.validUntil }
  if (w.version === 'v5r1') {
    const body = await v5(w, p.network).createTransfer(args)
    // wallet_id is decoded into @ton/ton's structured form and re-encoded: it must come back bit for bit.
    if (body.beginParse().skip(32).loadUint(32) !== w.walletId) throw new Error('This W5 wallet uses a non-standard wallet id the builder cannot reproduce. Paste a signed message instead.')
    return body
  }
  if (w.version === 'v4r2') return WalletContractV4.create({ workchain: w.address.workChain, publicKey: w.publicKey, walletId: w.walletId }).createTransfer(args)
  return WalletContractV3R2.create({ workchain: w.address.workChain, publicKey: w.publicKey, walletId: w.walletId }).createTransfer(args)
}

/** Wraps a wallet body into an external-in message BOC (base64). */
export function externalBoc(to: Address, body: Cell): string {
  return beginCell().store(storeMessage(external({ to, body }))).endCell().toBoc().toString('base64')
}

export interface TransferInput {
  to: string
  amount: bigint
  /** Text comment, or a base64/hex BOC used as the raw body (advanced). */
  comment?: string
  payloadBoc?: string
}

/** The internal message inside the transfer. Bounce follows the address flag (UQ… = non-bounceable); raw `0:…` is bounceable. */
export function transferMessage(t: TransferInput): MessageRelaxed {
  const to = t.to.trim()
  const parsed = Address.isFriendly(to) ? Address.parseFriendly(to) : { address: Address.parseRaw(to), isBounceable: true }
  const body = t.payloadBoc?.trim() ? parseBoc(t.payloadBoc) : t.comment?.trim() ? t.comment : undefined
  return internal({ to: parsed.address, value: t.amount, bounce: parsed.isBounceable, body })
}

// ---------------------------------------------------------------- pasted message

export interface ExternalInfo {
  dest: string
  hash: string
  normHash: string
  hasInit: boolean
  bodyBits: number
}

/** Validates a pasted external-in message BOC. Throws readable errors. */
export function inspectExternal(boc: string): ExternalInfo {
  const cell = parseBoc(boc)
  let msg
  try {
    msg = loadMessage(cell.beginParse())
  }
  catch {
    throw new Error('This BOC is not a message. Paste the full external message (what a wallet or script sends to sendBoc), not just its body.')
  }
  if (msg.info.type !== 'external-in') throw new Error(`This is an ${msg.info.type} message. The emulator takes an external message sent to a wallet or contract.`)
  return {
    dest: msg.info.dest.toRawString(),
    hash: messageHash(cell),
    normHash: normalizedExtMessageHash(cell),
    hasInit: !!msg.init,
    bodyBits: msg.body.bits.length
  }
}

// ---------------------------------------------------------------- emulator response

export interface TraceNode { tx_hash: string, in_msg_hash: string | null, children: TraceNode[] }

export interface V3Action {
  action_id?: string
  type: string
  success: boolean
  details: Record<string, unknown>
  transactions: string[]
}

export interface EmulateResponse {
  mc_block_seqno: number
  trace: TraceNode
  transactions: Record<string, V3Tx>
  actions?: V3Action[] | null
  is_incomplete?: boolean
}

export interface TraceRow { tx: TxView, depth: number, ok: boolean, label: string }

export interface TraceSummary {
  rows: TraceRow[]
  /** Per account, in first-seen order. */
  balances: { account: string, delta: bigint }[]
  ok: boolean
  totalFees: bigint
  incomplete: boolean
}

export function summarizeTrace(r: EmulateResponse, testOnly = false): TraceSummary {
  const rows: TraceRow[] = []
  const walk = (n: TraceNode, depth: number) => {
    const t = r.transactions[n.tx_hash]
    if (t) {
      const tx = txFromV3(t, testOnly)
      rows.push({ tx, depth, ...txOutcome(tx) })
    }
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(r.trace, 0)
  const map = new Map<string, bigint>()
  for (const { tx } of rows) map.set(tx.account, (map.get(tx.account) ?? 0n) + balanceChange(tx))
  return {
    rows,
    balances: [...map].map(([account, delta]) => ({ account, delta })),
    ok: rows.every(r => r.ok),
    totalFees: rows.reduce((s, r) => s + r.tx.totalFees, 0n),
    incomplete: !!r.is_incomplete
  }
}

/** Turns toncenter's emulator error text into an explanation. */
export function explainEmulatorError(text: string, walletVersion?: string | null): string {
  const m = /ExternalNotAccepted:\s*(-?\d+)/.exec(text)
  if (m) {
    const code = Number(m[1])
    return `The contract rejected the external message (exit code ${code}: ${describeExitCode(code, walletVersion)}). On the real network it would not be included in a block and no fee would be paid.`
  }
  if (/rejected by account .* before smart-contract execution/.test(text)) return `The account rejected the message before running its code: its balance cannot pay for the gas to check an external message (it needs a small amount of ${COIN_SYMBOL}), or it does not exist or is frozen.`
  return text
}

/** Readable "action" summary from toncenter's classifier, e.g. "Ton transfer". */
export const actionTitle = (type: string) => type.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

/** Raw addresses as toncenter returns them (0:ABC…). */
export const isRawAddress = (v: unknown): v is string => typeof v === 'string' && /^-?\d+:[0-9a-f]{64}$/i.test(v)

export interface ActionRow { label: string, kind: 'address' | 'coin' | 'text', value: string }

/** Keys in toncenter action details that hold nanoGRAM. Jetton/NFT amounts stay as raw base units. */
const COIN_KEYS = new Set(['value', 'ton_amount', 'forward_ton_amount', 'forward_amount', 'excess', 'fee'])

/** Flattens a toncenter action's details for display; skips empty values and extra-currency maps. */
export function actionRows(details: Record<string, unknown>): ActionRow[] {
  return Object.entries(details).flatMap(([k, v]): ActionRow[] => {
    if (v === null || v === undefined || v === '' || k.endsWith('extra_currencies')) return []
    const label = k.replace(/_/g, ' ')
    if (isRawAddress(v)) return [{ label, kind: 'address', value: v }]
    if (COIN_KEYS.has(k) && /^\d+$/.test(String(v))) return [{ label, kind: 'coin', value: String(v) }]
    return [{ label, kind: 'text', value: typeof v === 'object' ? JSON.stringify(v) : String(v) }]
  })
}
