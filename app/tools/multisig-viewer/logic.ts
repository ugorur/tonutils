// Multisig v2 (ton-blockchain/multisig-contract-v2): toncenter v3 indexer data plus our own order decoder.
// Order = Hashmap 8 ^Action; send_message#f1381e5b mode:uint8 message:^MessageRelaxed,
// update_multisig_params#1d0cfbd3 threshold:uint8 signers:^(Hashmap 8 MsgAddressInt) proposers:(HashmapE 8 MsgAddressInt).
import { Address, Dictionary, loadMessageRelaxed } from '@ton/core'
import type { DecodedBody } from '~/utils/ton/messages'
import { decodeBody, parseBoc } from '~/utils/ton/messages'
import { jettonDecimals } from '~/utils/ton/jetton'

// ---------------------------------------------------------------- toncenter shapes (fields we use)

export interface TcMultisig {
  address: string
  next_order_seqno: string
  threshold: number
  signers: string[]
  proposers: string[]
  last_transaction_lt: string
}
export interface TcOrder {
  address: string
  multisig_address: string
  order_seqno: string
  threshold: number
  sent_for_execution: boolean
  approvals_mask: string
  approvals_num: number
  expiration_date: number
  order_boc: string | null
  signers: string[]
  last_transaction_lt: string
}
export interface TcJettonWallets {
  jetton_wallets: { address: string, jetton: string }[]
  metadata?: Record<string, { token_info?: { type?: string | null, symbol?: string | null, name?: string | null, extra?: { decimals?: string | number | null } | null }[] }>
}

// ---------------------------------------------------------------- order decoding

export interface SendAction {
  kind: 'send'
  mode: number
  /** Raw 0:HEX of the destination. */
  destination: string
  bounce: boolean
  value: bigint
  body: DecodedBody | null
}
export interface UpdateAction {
  kind: 'update'
  threshold: number
  signers: string[]
  proposers: string[]
}
export type OrderAction = SendAction | UpdateAction | { kind: 'unknown', op: string }

const ADDRS = Dictionary.Values.Address()

export function decodeOrder(boc: string, opts: { testOnly?: boolean } = {}): OrderAction[] {
  const dict = Dictionary.loadDirect(Dictionary.Keys.Uint(8), Dictionary.Values.Cell(), parseBoc(boc))
  return dict.keys().sort((a, b) => a - b).map((k) => {
    const s = dict.get(k)!.beginParse()
    const op = s.loadUint(32)
    if (op === 0xf1381e5b) {
      const mode = s.loadUint(8)
      const msg = loadMessageRelaxed(s.loadRef().beginParse())
      if (msg.info.type !== 'internal') return { kind: 'unknown', op: 'external message' }
      return {
        kind: 'send',
        mode,
        destination: msg.info.dest.toRawString().toUpperCase(),
        bounce: msg.info.bounce,
        value: msg.info.value.coins,
        body: msg.body.bits.length || msg.body.refs.length ? decodeBody(msg.body, opts) : null
      }
    }
    if (op === 0x1d0cfbd3) {
      const threshold = s.loadUint(8)
      const signers = Dictionary.loadDirect(Dictionary.Keys.Uint(8), ADDRS, s.loadRef())
      const proposers = s.loadDict(Dictionary.Keys.Uint(8), ADDRS)
      const list = (d: Dictionary<number, Address>) => d.keys().sort((a, b) => a - b).map(i => d.get(i)!.toRawString().toUpperCase())
      return { kind: 'update', threshold, signers: list(signers), proposers: list(proposers) }
    }
    return { kind: 'unknown', op: `0x${op.toString(16).padStart(8, '0')}` }
  })
}

// ---------------------------------------------------------------- order state

export type OrderStatus = 'executed' | 'pending' | 'expired'

export function orderStatus(o: Pick<TcOrder, 'sent_for_execution' | 'expiration_date'>, now = Date.now() / 1000): OrderStatus {
  if (o.sent_for_execution) return 'executed'
  return o.expiration_date > now ? 'pending' : 'expired'
}

/** Bit i of approvals_mask = signer i approved (order.func: approvals_mask |= 1 << signer_index). */
export function approvals(mask: string, signers: string[]): { address: string, approved: boolean }[] {
  const m = BigInt(mask || 0)
  return signers.map((address, i) => ({ address, approved: ((m >> BigInt(i)) & 1n) === 1n }))
}

/** Owner's role in a multisig, for the "multisigs this wallet belongs to" list. */
export function roleOf(ms: Pick<TcMultisig, 'signers' | 'proposers'>, raw: string): 'signer' | 'proposer' | null {
  const r = raw.toUpperCase()
  if (ms.signers.some(s => s.toUpperCase() === r)) return 'signer'
  if (ms.proposers.some(s => s.toUpperCase() === r)) return 'proposer'
  return null
}

// ---------------------------------------------------------------- jetton transfers

export interface JettonMeta { master: string, symbol: string, decimals: number }

/** jetton wallet raw address -> master + symbol + decimals, from toncenter /jetton/wallets?address=… */
export function jettonMetaByWallet(r: TcJettonWallets): Map<string, JettonMeta> {
  const out = new Map<string, JettonMeta>()
  for (const w of r.jetton_wallets) {
    const info = r.metadata?.[w.jetton]?.token_info?.find(t => t.type === 'jetton_masters')
    out.set(w.address.toUpperCase(), { master: w.jetton, symbol: info?.symbol || info?.name || 'jetton', decimals: jettonDecimals({ decimals: info?.extra?.decimals }) })
  }
  return out
}

/** Destinations of jetton_transfer actions: the multisig's own jetton wallets, to resolve in one request. */
export function jettonWalletsIn(actions: OrderAction[]): string[] {
  return [...new Set(actions.filter((a): a is SendAction => a.kind === 'send' && a.body?.name === 'jetton_transfer').map(a => a.destination))]
}

export function friendly(raw: string, opts: { bounceable?: boolean, testOnly?: boolean } = {}): string {
  return Address.parse(raw).toString({ bounceable: opts.bounceable ?? true, testOnly: opts.testOnly })
}
