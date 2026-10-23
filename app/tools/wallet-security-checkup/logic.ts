// Wallet security checkup: one checklist from the wallet's own contract data (version, v4 plugins, W5
// extensions and signature flag), tonapi (scam tokens/NFTs, expiring domains, subscriptions) and the
// poisoning detector.
import type { TonapiNft } from '~/lib/nfts-write/chain'
import { type Check, type PoisonReport, scamTextReason } from '~/lib/security/core'
import type { TonapiAccount, TonapiJettonBalance } from '~/lib/wallet-actions/core'
import type { AccountReport, DataField } from '~/lib/wallet-detection/state'
import { COIN_SYMBOL } from '~/utils/currency'
import { classifyNft } from '../spam-nft-cleaner/logic'

export const EXAMPLE = 'UQA1eUxtUXQM0J3E53ydRKcCJIJWOI2prdCKY6UguqGeekpE'

/** "None" -> [], "0:ab…\n0:cd…" -> list; null when the wallet has no such field. */
export function listField(fields: DataField[] | undefined, label: string): string[] | null {
  const f = fields?.find(x => x.label === label)
  if (!f) return null
  return f.value === 'None' ? [] : f.value.split('\n').filter(Boolean)
}

export interface Expiring { name: string, expiring_at: number }
export interface Subscription { address: string, status?: string, beneficiary?: { address: string, name?: string }, metadata?: { name?: string } }

export interface CheckupInput {
  account: TonapiAccount | null
  report: AccountReport | null
  jettons: TonapiJettonBalance[] | null
  nfts: TonapiNft[] | null
  poison: PoisonReport | null
  expiring: Expiring[] | null
  subscriptions: Subscription[] | null
  now?: number
}

const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`
const DAY = 86400

export function checkup(i: CheckupInput): Check[] {
  const out: Check[] = []
  const now = i.now ?? Math.floor(Date.now() / 1000)
  const a = i.account
  const status = a?.status ?? 'nonexist'

  // --- account and wallet version
  if (a?.is_scam) out.push({ level: 'danger', title: 'This wallet itself is flagged as a scam by tonapi' })
  if (status === 'frozen') out.push({ level: 'danger', title: 'The account is frozen', detail: `It ran out of ${COIN_SYMBOL} for storage fees. Funds are locked until it is unfrozen.`, link: { to: '/tools/unfreeze-account', label: 'Unfreeze account' } })
  else if (a && status !== 'active') out.push({ level: 'info', title: 'Never used yet', detail: 'The wallet contract is not deployed: nothing to check on-chain yet.' })

  const kind = i.report?.wallet
  const short = kind?.label.replace(/^Wallet /, '') ?? ''
  if (status === 'active') {
    if (!kind) out.push({ level: 'info', title: 'Not a standard wallet contract', detail: 'Version, plugin and extension checks only apply to standard wallets.', link: { to: '/tools/wallet-version-detector', label: 'Detect the contract' } })
    else if (kind.version === 'v5r1') out.push({ level: 'ok', title: `Up-to-date wallet (${short})` })
    else if (kind.version.startsWith('v4')) out.push({ level: 'ok', title: `Wallet ${short}`, detail: 'Fully supported. W5 (v5r1) adds gasless transfers and extensions, but there is no security reason to move.' })
    else if (kind.version.startsWith('v1')) out.push({ level: 'warn', title: `Very old wallet version (${short})`, detail: 'v1 wallets have no expiry on signed messages and many apps no longer support them. Create a new wallet in your app and move your funds.', link: { to: '/tools/wallet-version-scanner', label: 'Find your other wallet versions' } })
    else if (kind.version.startsWith('v2') || kind.version.startsWith('v3')) out.push({ level: 'info', title: `Older wallet version (${short})`, detail: 'Still safe, but some apps and gasless features expect W5 or v4. Your app can create a W5 wallet from the same recovery phrase.', link: { to: '/tools/wallet-version-scanner', label: 'Find your other wallet versions' } })
    else out.push({ level: 'info', title: kind.label })
    if (i.report?.dataError) out.push({ level: 'info', title: 'Could not read the wallet data', detail: i.report.dataError })
  }

  // --- who else can move funds
  const fields = i.report?.data?.fields
  const plugins = listField(fields, 'Plugins')
  if (plugins) {
    if (plugins.length) {
      const subs = (i.subscriptions ?? []).map(s => s.metadata?.name ?? s.beneficiary?.name ?? s.address).join(', ')
      out.push({ level: 'warn', title: `${n(plugins.length, 'plugin')} can withdraw from this wallet`, detail: `v4 plugins (usually subscriptions) take funds without asking each time.${subs ? ` Known subscriptions: ${subs}.` : ''} Remove any you do not recognise in your wallet app (Tonkeeper: Settings → Subscriptions).\n${plugins.join('\n')}` })
    }
    else out.push({ level: 'ok', title: 'No plugins installed', detail: 'Nothing but your key can send from this wallet.' })
  }
  const ext = listField(fields, 'Extensions')
  const sig = fields?.find(f => f.label === 'Signature allowed')?.value
  if (sig === 'No') out.push({ level: 'danger', title: 'Signing with your key is disabled', detail: 'Only extensions can control this W5 wallet now. If you did not do this on purpose, someone else controls your funds.', link: { to: '/tools/wallet-v5-actions-builder', label: 'W5 actions builder' } })
  if (ext) {
    if (ext.length) out.push({ level: 'warn', title: `${n(ext.length, 'extension')} can send from this wallet without your signature`, detail: `Only keep extensions you installed on purpose.\n${ext.join('\n')}`, link: { to: '/tools/wallet-v5-actions-builder', label: 'Remove an extension' } })
    else out.push({ level: 'ok', title: 'No extensions installed', detail: 'Only your key can send from this wallet.' })
  }

  // --- what the wallet holds
  if (i.jettons) {
    const scam = i.jettons.filter(b => b.jetton.verification === 'blacklist' || (b.jetton.verification !== 'whitelist' && scamTextReason([b.jetton.name, b.jetton.symbol].join(' '))))
    if (scam.length) out.push({ level: 'warn', title: `${n(scam.length, 'scam token')} in this wallet`, detail: `${scam.slice(0, 6).map(b => b.jetton.symbol ?? b.jetton.name ?? '?').join(', ')}${scam.length > 6 ? '…' : ''}. Airdropped bait: do not visit sites in their names or try to sell or “unlock” them. Hide them in your wallet.`, link: { to: '/tools/token-safety-check', label: 'Check a token' } })
    else out.push({ level: 'ok', title: 'No scam tokens' })
    const locked = i.jettons.filter(b => b.lock && BigInt(b.lock.amount) > 0n && b.lock.till > now)
    if (locked.length) out.push({ level: 'info', title: `${n(locked.length, 'token balance')} locked`, detail: locked.map(b => `${b.jetton.symbol ?? '?'} until ${new Date(b.lock!.till * 1000).toISOString().slice(0, 10)}`).join(', ') })
  }
  if (i.nfts) {
    const bad = i.nfts.filter((x) => {
      const c = classifyNft(x).cls
      return c === 'scam' || c === 'suspicious'
    })
    if (bad.length) out.push({ level: 'warn', title: `${n(bad.length, 'scam or spam NFT')} in this wallet`, detail: 'Fake vouchers and “claim” NFTs lead to drainer sites. Hide them, or test and burn them safely.', link: { to: '/tools/spam-nft-cleaner', label: 'Spam NFT cleaner' } })
    else out.push({ level: 'ok', title: 'No scam NFTs' })
  }

  // --- history
  if (i.poison) {
    const fakes = i.poison.groups.reduce((s, g) => s + g.fakes.length, 0)
    if (fakes) out.push({ level: 'danger', title: `${n(fakes, 'look-alike address', 'look-alike addresses')} planted in your history`, detail: `The fakes imitate ${i.poison.groups.length} of the addresses you really deal with. Never copy a recipient from your history.`, link: { to: '/tools/address-poisoning-detector', label: 'See the fakes' } })
    else out.push({ level: 'ok', title: 'No address poisoning in recent history', detail: `Checked the last ${n(i.poison.events, 'event')}.${i.poison.junkSenders.length ? ` ${n(i.poison.junkSenders.length, 'account')} sent you dust or spam.` : ''}` })
  }

  // --- domains
  if (i.expiring?.length) {
    const soon = i.expiring.filter(d => d.expiring_at - now < 30 * DAY)
    out.push({
      level: soon.length ? 'warn' : 'info',
      title: `${n(i.expiring.length, 'domain')} expiring within 60 days`,
      detail: `${i.expiring.map(d => `${d.name} (${Math.max(0, Math.round((d.expiring_at - now) / DAY))} days)`).join(', ')}. An expired .ton domain goes back to auction and someone else can take it.`,
      link: { to: '/tools/dns-renew', label: 'Renew domains' }
    })
  }
  return out
}
