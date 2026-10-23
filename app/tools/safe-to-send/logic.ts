// "Is it safe to send?": pre-flight checks for a destination address, from tonapi account info, the
// Tonkeeper label list, the destination's own recent activity and (optionally) the sender's history.
import { Address } from '@ton/core'
import { type Check, type Counterparty, isSpamSender, type Label, type SenderProfile, visibleMatch, type VisibleMatch, ZERO_RAWS } from '~/lib/security/core'
import { chooseBounce, type Purpose, type TonapiAccount } from '~/lib/wallet-actions/core'
import { COIN_SYMBOL } from '~/utils/currency'

export { parseRecipient } from '~/lib/wallet-actions/core'

export const EXAMPLES = [
  { label: 'Exchange deposit (needs a memo)', value: 'EQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xNJb' },
  { label: 'A known poisoner', value: 'UQBqc8IJqOnIKKN78FLxTEFRi7mtisxNiIQ_80EiFBYWw7ja' },
  { label: 'foundation.ton', value: 'foundation.ton' }
]

export interface HistoryCheck {
  /** You sent value to this exact address before. */
  sentBefore: boolean
  /** It only ever sent you dust / spam. */
  junkOnly: boolean
  /** A real counterparty it imitates. */
  lookalike: { raw: string, match: VisibleMatch } | null
}

/** Compares a destination with the sender's own counterparties (from ~/lib/security/core counterparties()). */
export function compareWithHistory(dest: Address, cps: Map<string, Counterparty>, testnet = false): HistoryCheck {
  const raw = dest.toRawString().toLowerCase()
  const me = cps.get(raw)
  const sentBefore = !!me && me.sent > 0
  const junkOnly = !!me && me.sent === 0 && me.received === 0 && me.junkIn > 0
  let lookalike: HistoryCheck['lookalike'] = null
  if (!sentBefore) {
    for (const c of cps.values()) {
      if (c.sent === 0 && c.received === 0) continue
      const m = visibleMatch(raw, c.raw, testnet)
      if (m && (!lookalike || m.prefix + m.suffix > lookalike.match.prefix + lookalike.match.suffix)) lookalike = { raw: c.raw, match: m }
    }
  }
  return { sentBefore, junkOnly, lookalike }
}

export interface PreflightInput {
  address: Address
  /** Bounce flag of the typed form: EQ true, UQ false, raw or domain null. */
  typedBounceable: boolean | null
  typedTestOnly: boolean | null
  domain: string | null
  account: TonapiAccount | null
  label?: Label
  testnet: boolean
  purpose: Purpose
  profile?: SenderProfile | null
  history?: HistoryCheck | null
}

const deployed = (s: string) => s === 'active' || s === 'frozen'
const friendly = (a: Address, bounceable: boolean, testnet: boolean) => a.toString({ bounceable, testOnly: testnet, urlSafe: true })

/** The form to paste into a wallet: non-bounceable for undeployed accounts and wallets, bounceable for contracts. */
export function recommendedForm(i: Pick<PreflightInput, 'address' | 'typedBounceable' | 'account' | 'testnet'>): { address: string, bounceable: boolean } {
  const status = i.account?.status ?? 'nonexist'
  let bounceable = chooseBounce(i.typedBounceable, status).bounceable
  if (deployed(status) && i.typedBounceable === null) bounceable = i.account?.is_wallet === false
  return { address: friendly(i.address, bounceable, i.testnet), bounceable }
}

export function preflight(i: PreflightInput): Check[] {
  const out: Check[] = []
  const a = i.account
  const raw = i.address.toRawString().toLowerCase()
  const what = i.purpose === 'coin' ? COIN_SYMBOL : i.purpose === 'jetton' ? 'tokens' : 'the NFT'
  const ifaces = a?.interfaces ?? []
  const name = a?.name ?? i.label?.name

  // --- format and network
  const form = i.typedBounceable === null ? (i.domain ? `${i.domain} resolves to this wallet` : 'Raw form (0:…)') : i.typedBounceable ? 'Bounceable form (EQ…/kQ…)' : 'Non-bounceable form (UQ…/0Q…)'
  out.push({ level: 'ok', title: i.domain ? `${i.domain} points to a valid address` : 'Valid TON address, checksum correct', detail: form })
  if (i.typedTestOnly !== null && i.typedTestOnly !== i.testnet) {
    out.push(i.testnet
      ? { level: 'warn', title: 'Mainnet address, but the site is on testnet', detail: 'Switch the network in the header if you meant mainnet.' }
      : { level: 'warn', title: 'This is a testnet-only address (0Q…/kQ…)', detail: 'You are on mainnet. Real funds sent to a testnet-form address still arrive on mainnet, but the person probably gave you a test address by mistake. Ask for their mainnet address.' })
  }
  if (ZERO_RAWS.includes(raw)) out.push({ level: 'danger', title: 'This is the zero (burn) address', detail: `Nobody holds its key: ${what} sent here are gone forever.` })

  // --- reputation
  if (a?.is_scam) out.push({ level: 'danger', title: 'Flagged as a scam by tonapi (Tonkeeper)', detail: 'Do not send unless you are absolutely sure.' })
  if (i.history?.junkOnly) out.push({ level: 'danger', title: 'This address only ever sent you dust or spam', detail: 'It sits in your history because it sent you a tiny transfer. This is how address-poisoning fakes get copied. Take the address from the real recipient instead.', link: { to: '/tools/address-poisoning-detector', label: 'Scan your history' } })
  if (i.history?.lookalike) {
    const real = Address.parse(i.history.lookalike.raw)
    out.push({ level: 'danger', title: 'Looks like an address you paid before, but it is a different one', detail: `You sent to ${friendly(real, false, i.testnet)} before. This address shares its visible ending. Classic address poisoning: compare every character.`, link: { to: '/tools/address-poisoning-detector', label: 'Scan your history' } })
  }
  if (i.history?.sentBefore) out.push({ level: 'ok', title: 'You have sent to this exact address before' })
  if (i.profile && isSpamSender(i.profile)) {
    out.push({ level: 'danger', title: 'Behaves like a spam or address-poisoning sender', detail: `Its recent outgoing transfers are ${i.profile.junkOut} tiny or spam transfers to ${i.profile.recipients} account(s) and nothing of value.${i.profile.baitComment ? ` Example comment: “${i.profile.baitComment.slice(0, 80)}”.` : ''}` })
  }
  if (name) out.push({ level: 'ok', title: `Known as “${name}”`, detail: a?.name ? 'Name from tonapi / Tonkeeper.' : 'Name from Tonkeeper\'s public ton-assets list.' })

  // --- memo
  if (a?.memo_required || i.label?.memo) {
    out.push({ level: 'warn', title: `${name ?? 'This address'} requires a comment (memo)`, detail: 'Exchanges credit deposits by the memo. Copy it from the exchange\'s deposit page and paste it into the comment field, or the deposit can be lost.' })
  }

  if (!a) return out

  // --- status and bounce
  if (a.status === 'active') out.push({ level: 'ok', title: 'Account is active' })
  else if (a.status === 'frozen') out.push({ level: 'warn', title: 'Account is frozen', detail: `It ran out of ${COIN_SYMBOL} for storage fees. Incoming funds first pay its debt; only send if the owner asked you to unfreeze it.`, link: { to: '/tools/unfreeze-account', label: 'Unfreeze account' } })
  else out.push({ level: 'info', title: 'Never used yet (not activated)', detail: 'Normal for a brand-new wallet: it activates with its first outgoing transfer. Double-check the address with the recipient, since nothing on-chain confirms who owns it.' })

  if (!deployed(a.status) && i.typedBounceable === true && i.purpose === 'coin') {
    out.push({ level: 'warn', title: 'Bounceable form to an inactive address: the coins would bounce back', detail: `A bounceable transfer to an account that is not active returns to you minus fees. Use the non-bounceable form shown below (UQ…).` })
  }
  if (deployed(a.status) && a.is_wallet === false && i.typedBounceable === false && i.purpose === 'coin') {
    out.push({ level: 'info', title: 'Non-bounceable form for a smart contract', detail: `If the contract rejects the transfer, ${COIN_SYMBOL} sent non-bounceable is not returned. Prefer the bounceable form (EQ…) shown below.` })
  }

  // --- what kind of account
  if (ifaces.some(x => x.startsWith('jetton_wallet'))) out.push({ level: 'danger', title: 'This is a jetton wallet (a token balance contract), not a person\'s wallet', detail: 'Ask the recipient for their main wallet address, the one their wallet app shows (UQ…/EQ…).' })
  else if (ifaces.includes('jetton_master')) out.push({ level: i.purpose === 'coin' ? 'warn' : 'danger', title: 'This is a token contract (jetton master), not a wallet', detail: `${what} sent here are usually lost.` })
  else if (ifaces.includes('nft_item') || ifaces.includes('nft_collection')) out.push({ level: i.purpose === 'coin' ? 'warn' : 'danger', title: 'This is an NFT contract, not a wallet', detail: `${what} sent here are usually lost.` })
  else if (a.is_wallet && deployed(a.status)) out.push({ level: 'ok', title: `This is a wallet${ifaces.length ? ` (${ifaces.join(', ').replace(/_/g, ' ')})` : ''}` })
  else if (a.is_wallet === false && deployed(a.status) && !name) {
    out.push({ level: 'warn', title: `Unknown smart contract, not a wallet${ifaces.length ? ` (${ifaces.join(', ')})` : ''}`, detail: `Only send if an app you trust told you to. TON has no token approvals: a site asking you to send ${COIN_SYMBOL} to a contract to “claim”, “verify” or “unlock” something is a drainer.` })
  }
  return out
}
