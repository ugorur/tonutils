// Internal message builder: one message -> MessageRelaxed BOC, TonConnect JSON, ton:// link. Pure TS.
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { Cell } from '@ton/core'
import type { MessageSpec } from '~/lib/payloads/message'
import { b64, messageRelaxedCell, stateInitCell } from '~/lib/payloads/message'

export { buildBody, buildStateInit, initAddressCheck, messageRelaxedCell } from '~/lib/payloads/message'
export type { BodyKind, MessageSpec } from '~/lib/payloads/message'

/** Destination as TonConnect wallets expect it: user-friendly, with the chosen bounce flag and network. */
export function friendlyDest(m: Pick<MessageSpec, 'to' | 'bounce'>, network: TonNetwork): string {
  return m.to.toString({ bounceable: m.bounce, testOnly: network === 'testnet', urlSafe: true })
}

/** One TonConnect `messages[]` entry (TonConnect 2 sendTransaction). */
export function tonConnectMessage(m: MessageSpec, network: TonNetwork) {
  return {
    address: friendlyDest(m, network),
    amount: m.value.toString(),
    ...(m.body ? { payload: b64(m.body) } : {}),
    ...(m.init ? { stateInit: b64(stateInitCell(m.init)) } : {})
  }
}

/** Full sendTransaction request as JSON text. */
export function tonConnectRequest(m: MessageSpec, network: TonNetwork, validUntil: number) {
  return { validUntil, network: network === 'testnet' ? '-3' : '-239', messages: [tonConnectMessage(m, network)] }
}

/** url-safe base64 without padding. Written by hand: the browser Buffer polyfill has no 'base64url'. */
const base64url = (c: Cell) => c.toBoc().toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * ton://transfer link (TON deeplink standard, also understood by Tonkeeper / MyTonWallet / Tonhub):
 * amount in nano, then `text` for a plain comment, or `bin` (url-safe base64 BOC) for any other body, plus `init`.
 */
export function transferLink(m: MessageSpec, network: TonNetwork, comment?: string): string {
  // Percent-encoded by hand: URLSearchParams writes spaces as '+', which decodeURIComponent-based wallets show literally.
  const q = [`amount=${m.value}`]
  if (comment) q.push(`text=${encodeURIComponent(comment)}`)
  else if (m.body) q.push(`bin=${base64url(m.body)}`)
  if (m.init) q.push(`init=${base64url(stateInitCell(m.init))}`)
  return `ton://transfer/${friendlyDest(m, network)}?${q.join('&')}`
}

/** Everything the UI shows for a finished message. */
export function buildOutputs(m: MessageSpec, network: TonNetwork) {
  const cell = messageRelaxedCell(m)
  return {
    messageBoc: b64(cell),
    messageHash: cell.hash().toString('hex'),
    bodyBoc: m.body ? b64(m.body) : null,
    bodyHash: m.body ? m.body.hash().toString('hex') : null,
    stateInitBoc: m.init ? b64(stateInitCell(m.init)) : null
  }
}
