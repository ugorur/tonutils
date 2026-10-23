// Gasless jetton transfer through tonapi's relayer: the fee is paid in the jetton, the wallet needs no GRAM.
// Flow (docs.ton.org "Sign message (gasless)"): estimate -> wallet signMessage (no broadcast) -> wrap -> relay.
import { Address, beginCell, Cell, external, internal, loadMessageRelaxed, storeMessage, storeMessageRelaxed } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { TOKEN_GAS } from '~/lib/wallet-actions/core'
import { COIN_SYMBOL } from '~/utils/currency'
import { decodeBody, jettonTransferBody, normalizedExtMessageHash } from '~/utils/ton/messages'

/** GET /v2/gasless/config */
export interface GaslessConfig {
  relay_address: string
  gas_jettons: { master_id: string }[]
}

/** POST /v2/gasless/estimate/{master} response (SignRawParams). Cells are hex BOCs. */
export interface GaslessEstimate {
  protocol_name: string
  relay_address: string
  /** Relay fee in the jetton's base units. */
  commission: string
  from: string
  valid_until: number
  messages: { address: string, amount: string, payload?: string, stateInit?: string }[]
}

/** Raw lowercase masters the relayer accepts as fee currency. */
export function gasJettons(cfg: GaslessConfig): Set<string> {
  return new Set(cfg.gas_jettons.map(j => Address.parse(j.master_id).toRawString()))
}

/**
 * Request body for /v2/gasless/estimate/{master}: the user's jetton transfer as a full internal message
 * (to their jetton wallet, 0.05 GRAM attached for the estimator), excess sent to the relay (lowers the fee).
 */
export function estimateRequest(p: { owner: Address, publicKey: string, jettonWallet: Address, amount: bigint, destination: Address, relay: Address, comment?: string, queryId?: bigint }) {
  const body = jettonTransferBody({
    queryId: p.queryId ?? 0n,
    amount: p.amount,
    destination: p.destination,
    responseDestination: p.relay,
    forwardTonAmount: 1n,
    forwardPayload: p.comment?.trim() || undefined
  })
  const msg = beginCell().store(storeMessageRelaxed(internal({ to: p.jettonWallet, bounce: true, value: TOKEN_GAS, body }))).endCell()
  return { wallet_address: p.owner.toRawString(), wallet_public_key: p.publicKey, messages: [{ boc: msg.toBoc().toString('hex') }] }
}

/** The estimator's messages as TonConnect messages (what the wallet signs and TxPreview shows). */
export function toTonConnectMessages(e: GaslessEstimate): TonConnectMessage[] {
  const b64 = (hex?: string) => (hex ? Cell.fromHex(hex).toBoc().toString('base64') : undefined)
  return e.messages.map(m => ({ address: m.address, amount: BigInt(m.amount), payload: b64(m.payload), stateInit: b64(m.stateInit) }))
}

/**
 * Most GRAM a relayer message may attach. The wallet sends these amounts from its own balance (the relayer
 * tops it up), so a larger value would spend the user's GRAM and hand the excess to the relay.
 */
export const MAX_ATTACHED = 2n * TOKEN_GAS // 0.1 GRAM

/**
 * The relayer chooses what the wallet signs, so check its answer before showing a send button: our own
 * transfer unchanged first, then only the fee transfer (exactly `commission`, to the relay), all from our
 * jetton wallet, without StateInit and with at most MAX_ATTACHED each. Returns why it is refused, or null.
 */
export function checkEstimate(e: GaslessEstimate, req: ReturnType<typeof estimateRequest>, relay: Address): string | null {
  const ours = loadMessageRelaxed(Cell.fromHex(req.messages[0]!.boc).beginParse())
  if (ours.info.type !== 'internal') return 'Bad request.'
  const wallet = ours.info.dest
  const [first, ...rest] = e.messages
  if (!first || !first.payload || !Cell.fromHex(first.payload).hash().equals(ours.body.hash())) return 'The relayer changed the transfer.'
  for (const m of e.messages) {
    if (!Address.parse(m.address).equals(wallet) || m.stateInit) return 'The relayer asked to send to an unexpected contract.'
    if (BigInt(m.amount) > MAX_ATTACHED) return `The relayer asked to attach more ${COIN_SYMBOL} than a token transfer needs.`
  }
  for (const m of rest) {
    const d = m.payload ? decodeBody(Cell.fromHex(m.payload)) : null
    if (d?.name !== 'jetton_transfer' || d.fields.amount !== BigInt(e.commission) || !Address.parse(String(d.fields.destination)).equals(relay)) {
      return 'The relayer added a transfer other than its fee.'
    }
  }
  return null
}

/**
 * Wraps the wallet's signed internal message (signMessage `internalBoc`, base64) in an external message
 * to the same wallet, as /v2/gasless/send expects. Returns the hex BOC to submit and its normalized hash.
 */
export function wrapSignedInternal(internalBoc: string): { hex: string, hash: string } {
  const msg = loadMessageRelaxed(Cell.fromBase64(internalBoc).beginParse())
  if (msg.info.type !== 'internal') throw new Error('The wallet did not return an internal message.')
  const ext = beginCell().store(storeMessage(external({ to: msg.info.dest, init: msg.init ?? undefined, body: msg.body }))).endCell()
  return { hex: ext.toBoc().toString('hex'), hash: normalizedExtMessageHash(ext) }
}

/** Seconds left before the estimate expires (<= 0: get a new quote). */
export function secondsLeft(e: GaslessEstimate, nowMs = Date.now()): number {
  return e.valid_until - Math.floor(nowMs / 1000)
}
