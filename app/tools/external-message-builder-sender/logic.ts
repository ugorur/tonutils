// Analyze, build and sign external-in messages. Signing happens locally; only the signed BOC is broadcast.
import type { Cell, MessageRelaxed, SendMode } from '@ton/core'
import { Address, beginCell, external, internal, loadMessage, loadMessageRelaxed, loadOutList, loadStateInit, storeMessage } from '@ton/core'
import { keyPairFromSecretKey, keyPairFromSeed, mnemonicToPrivateKey, mnemonicValidate } from '@ton/crypto'
import { WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import type { TonNetwork } from '~/composables/useTonNetwork'
import { decodeBody, normalizedExtMessageHash, parseBoc } from '~/utils/ton/messages'
import type { DecodedBody } from '~/utils/ton/messages'
import { NETWORK_GLOBAL_ID } from '~/utils/ton/wallets'

// ---------------------------------------------------------------- analysis

export interface OutMsg {
  mode: number
  dest: string | null
  value: bigint
  bounce: boolean
  body: DecodedBody
  deploys: boolean
}

export interface WalletBody {
  kind: 'v3/v4' | 'w5'
  seqno: number
  validUntil: number
  /** subwallet id (v3/v4) or wallet id (W5). */
  walletId: number
  messages: OutMsg[]
}

export interface ExternalInfo {
  dest: Address
  hasInit: boolean
  /** StateInit code hash (hex) when the message deploys the contract. */
  initCodeHash: string | null
  body: Cell
  /** Full message cell hash (hex). */
  hash: string
  /** TEP-467 normalized hash (hex): what toncenter indexes and explorers show. */
  normHash: string
  wallet: WalletBody | null
}

const W5_SIGNED_EXTERNAL = 0x7369676e // "sign"

function outMsg(mode: number, m: MessageRelaxed, testOnly: boolean): OutMsg {
  const int = m.info.type === 'internal' ? m.info : null
  const dest = m.info.dest
  return {
    mode,
    dest: !dest ? null : Address.isAddress(dest) ? dest.toString({ testOnly, bounceable: int?.bounce ?? true }) : dest.toString(),
    value: int?.value.coins ?? 0n,
    bounce: int?.bounce ?? false,
    body: decodeBody(m.body, { testOnly }),
    deploys: !!m.init
  }
}

/** Best-effort parse of a standard wallet's signed external body (v3/v4 or W5). Null when it is something else. */
export function parseWalletBody(body: Cell, testOnly = false): WalletBody | null {
  try {
    const s = body.beginParse()
    if (s.remainingBits >= 32 && s.preloadUint(32) === W5_SIGNED_EXTERNAL) {
      s.skip(32)
      const walletId = s.loadUint(32)
      const validUntil = s.loadUint(32)
      const seqno = s.loadUint(32)
      const outRef = s.loadMaybeRef()
      const actions = outRef ? loadOutList(outRef.beginParse()) : []
      const messages = actions.flatMap(a => (a.type === 'sendMsg' ? [outMsg(a.mode, a.outMsg, testOnly)] : []))
      return { kind: 'w5', seqno, validUntil, walletId, messages }
    }
    if (s.remainingBits < 512 + 96) return null
    s.skip(512)
    const walletId = s.loadUint(32)
    const validUntil = s.loadUint(32)
    const seqno = s.loadUint(32)
    // v3: (mode:uint8 ^msg)*; v4 adds op:uint8 first. One spare byte beyond the per-ref modes means v4.
    if (s.remainingBits === 8 * s.remainingRefs + 8) {
      const op = s.loadUint(8) // v4: 0 = simple send
      if (op !== 0) return null
    }
    else if (s.remainingBits !== 8 * s.remainingRefs) return null
    const messages: OutMsg[] = []
    while (s.remainingRefs > 0 && s.remainingBits >= 8) messages.push(outMsg(s.loadUint(8), loadMessageRelaxed(s.loadRef().beginParse()), testOnly))
    return { kind: 'v3/v4', seqno, validUntil, walletId, messages }
  }
  catch {
    return null
  }
}

/** Parses a signed external-in message BOC. Throws a readable Error for anything else. */
export function analyzeExternal(boc: string | Cell, testOnly = false): ExternalInfo {
  const cell = typeof boc === 'string' ? parseBoc(boc) : boc
  let msg
  try {
    msg = loadMessage(cell.beginParse())
  }
  catch {
    throw new Error('This BOC is not a message. Paste a full external message (what a wallet or SDK broadcasts), not just a body.')
  }
  if (msg.info.type !== 'external-in') throw new Error(`This is an ${msg.info.type} message. Only external-in messages can be broadcast; internal ones are sent by contracts.`)
  return {
    dest: msg.info.dest,
    hasInit: !!msg.init,
    initCodeHash: msg.init?.code ? msg.init.code.hash().toString('hex') : null,
    body: msg.body,
    hash: cell.hash().toString('hex'),
    normHash: normalizedExtMessageHash(cell),
    wallet: parseWalletBody(msg.body, testOnly)
  }
}

/** Builds an unsigned external-in message to any contract (for contracts that accept unsigned externals). */
export function buildRawExternal(p: { to: Address, body: Cell | null, init: Cell | null }): Cell {
  const init = p.init ? loadStateInit(p.init.beginParse()) : undefined
  return beginCell().store(storeMessage(external({ to: p.to, body: p.body ?? beginCell().endCell(), init }))).endCell()
}

// ---------------------------------------------------------------- signing

export interface KeyPair { publicKey: Buffer, secretKey: Buffer }

/** 24-word TON mnemonic, 32-byte seed (64 hex) or 64-byte secret key (128 hex). Never leaves the browser. */
export async function keyFromSecret(input: string): Promise<KeyPair> {
  const s = input.trim()
  if (!s) throw new Error('Enter a mnemonic or a private key')
  const hex = s.replace(/^0x/i, '')
  if (/^[0-9a-f]+$/i.test(hex)) {
    if (hex.length === 64) return keyPairFromSeed(Buffer.from(hex, 'hex'))
    if (hex.length === 128) return keyPairFromSecretKey(Buffer.from(hex, 'hex'))
    throw new Error('A private key is 64 hex characters (seed) or 128 (seed + public key)')
  }
  const words = s.toLowerCase().split(/\s+/)
  if (words.length !== 24 && words.length !== 12) throw new Error(`Expected 24 (or 12) words, got ${words.length}`)
  if (!(await mnemonicValidate(words))) throw new Error('Not a valid TON mnemonic (BIP-39 phrases from other chains do not work here)')
  return mnemonicToPrivateKey(words)
}

export const SIGN_VERSIONS = [
  { label: 'W5 (v5r1)', value: 'v5r1' },
  { label: 'v4r2', value: 'v4r2' },
  { label: 'v3r2', value: 'v3r2' }
] as const
export type SignVersion = typeof SIGN_VERSIONS[number]['value']

export function walletContract(version: SignVersion, publicKey: Buffer, network: TonNetwork) {
  switch (version) {
    case 'v5r1': return WalletContractV5R1.create({ workchain: 0, publicKey, walletId: { networkGlobalId: NETWORK_GLOBAL_ID[network] } })
    case 'v4r2': return WalletContractV4.create({ workchain: 0, publicKey })
    case 'v3r2': return WalletContractV3R2.create({ workchain: 0, publicKey })
  }
}

export interface TransferSpec {
  to: Address
  value: bigint
  bounce: boolean
  body: Cell | null
  init?: Cell | null
}

/** Signs a wallet transfer and wraps it in an external-in message (with StateInit when seqno is 0). */
export function buildSignedTransfer(p: {
  version: SignVersion
  key: KeyPair
  network: TonNetwork
  seqno: number
  messages: TransferSpec[]
  sendMode: SendMode
  /** Unix seconds; the wallet rejects the message after this. */
  validUntil: number
  deploy: boolean
}): Cell {
  const wallet = walletContract(p.version, p.key.publicKey, p.network)
  const messages = p.messages.map(m => internal({
    to: m.to,
    value: m.value,
    bounce: m.bounce,
    body: m.body ?? undefined,
    init: m.init ? loadStateInit(m.init.beginParse()) : undefined
  }))
  const args = { seqno: p.seqno, secretKey: p.key.secretKey, messages, sendMode: p.sendMode, timeout: p.validUntil }
  const body = wallet instanceof WalletContractV5R1 ? wallet.createTransfer(args) : wallet.createTransfer(args)
  return beginCell().store(storeMessage(external({ to: wallet.address, init: p.deploy ? wallet.init : undefined, body }))).endCell()
}

// Wallet exit codes: v3/v4 (wallet-contract sources) and W5 (wallet-contract-v5 sources).
const EXIT_CODES: Record<number, string> = {
  33: 'Wrong seqno: this sequence number was already used. Rebuild with the current seqno.',
  34: 'Wrong subwallet id: the message was signed for a different wallet.',
  35: 'Bad signature (the key does not match this wallet), or, on v3, the message expired.',
  36: 'Expired: valid_until is in the past. Rebuild and sign again.',
  133: 'Wrong seqno: this sequence number was already used. Rebuild with the current seqno.',
  134: 'Wrong wallet id: signed for a different wallet or network.',
  135: 'Bad signature: the key does not match this wallet.',
  136: 'Expired: valid_until is in the past. Rebuild and sign again.',
  132: 'Signature auth is disabled on this W5 wallet (it is controlled by an extension).',
  137: 'W5 requires the +2 (ignore errors) flag in every send mode of an external message.'
}

/** Explains toncenter's sendBoc errors in plain words. */
export function explainBroadcastError(text: string): string {
  const code = /exit ?code[=: ]+(-?\d+)/i.exec(text)?.[1]
  if (code && EXIT_CODES[Number(code)]) return `${EXIT_CODES[Number(code)]} (exit code ${code}; the node rejected it, no fee was charged)`
  const t = text.toLowerCase()
  if (t.includes('duplicate') || t.includes('already')) return 'The network already has this exact message (it was broadcast before).'
  if (t.includes('unpack') || t.includes('deserialize')) return 'The node could not parse this BOC as a message.'
  if (t.includes('not accepted') || t.includes('cannot apply external')) return `The contract did not accept the message (wrong seqno, expired, bad signature or no balance). No fee was charged. Node said: ${text}`
  return text
}
