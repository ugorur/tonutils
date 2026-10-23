// Token safety check: risk signals for a jetton from tonapi (verification, admin, holders), toncenter
// (wallet code, metadata location, admin type) and DexScreener (DEX liquidity).
import { isRenounced, type TonapiJetton } from '~/lib/jettons-read/core'
import { type Check, impersonates, rawOf, scamTextReason, trustCheck } from '~/lib/security/core'
import { formatJettonAmount, jettonDecimals } from '~/utils/ton/jetton'

export const EXAMPLES = [
  { label: 'Notcoin', value: 'EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT' },
  { label: 'A scam airdrop token', value: 'EQBjIKbFb9eDW3L86C0k6fpX55zn_rqOzcD85OTxGdffeiDy' },
  { label: 'Tether USD₮', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' }
]

/**
 * Jetton wallet code hashes (toncenter jetton/masters jetton_wallet_code_hash) seen on verified tokens,
 * read from toncenter on 2026-10-23. A hash outside this list is not bad by itself, just less common.
 */
export const KNOWN_WALLET_CODES: Record<string, string> = {
  'vrBoPr64kn/p/I7AoYvH3ReJlomCWhIeq0bFo6hg0M4=': 'Standard jetton wallet (TEP-74 reference code, as deployed by minter.ton.org)',
  'jSjqQht36AX+pSrPM1KWSZ8Drsjp/SHdtfJWSqZcSN4=': 'Same wallet code as Notcoin, DOGS and MAJOR',
  'iUaPAseOVwgC45l5yFFvw43wfqdqSDV+BTbyuns+43s=': 'Same wallet code as Tether USD₮',
  'p2DWKdU0PnbQRQF9ncIW/IoweoN3gV/rKwpcSQ5zNIY=': 'Same wallet code as STON and GEMSTON',
  'CJYh3XfgqaSuRCeeWS8T1qtcVd7NYMyew2t8KuQNFZU=': 'Same wallet code as tsTON (Tonstakers)',
  'LXly9xL8OYvDL2eWmArXEZB0NKMRtX/nLSD3UQshI+Y=': 'Same wallet code as stGRAM (bemo)',
  'ULkX2f1blXYJkyh2d9BIEqFapV5rcdD5Im7NfCDD2Co=': 'Same wallet code as hGRAM (Hipo)',
  'ngbKMOUIptn7IRZ8u49mOZ7dEZCwsB4LvRTFRsyXpys=': 'Same wallet code as jUSDT (TON bridge)'
}

/** tonapi GET /v2/jettons/{m}/holders. */
export interface Holders { addresses: { address: string, owner: { address: string, name?: string, is_wallet?: boolean, is_scam?: boolean }, balance: string }[], total: number }

/** toncenter GET /api/v3/jetton/masters?address={m}. */
export interface TcMasters {
  jetton_masters: { address: string, admin_address: string | null, mintable: boolean, jetton_content: Record<string, string>, jetton_wallet_code_hash: string }[]
  address_book: Record<string, { user_friendly: string, interfaces?: string[] }>
}

/** DexScreener GET /latest/dex/tokens/{m}. */
export interface DexPairs { pairs: { dexId: string, pairAddress: string, baseToken: { address: string, symbol: string }, quoteToken: { address: string, symbol: string }, liquidity?: { usd?: number } }[] | null }

export interface Liquidity { usd: number, pools: number, top: { dex: string, pair: string, usd: number }[] }

/** USD locked in DEX pools that contain this token (both sides of each pool). */
export function liquidity(d: DexPairs | null, masterRaw: string): Liquidity | null {
  if (!d) return null
  const mine = (d.pairs ?? []).filter(p => rawOf(p.baseToken.address) === masterRaw || rawOf(p.quoteToken.address) === masterRaw)
  const top = mine.map(p => ({ dex: p.dexId, pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`, usd: p.liquidity?.usd ?? 0 })).sort((a, b) => b.usd - a.usd)
  return { usd: top.reduce((s, p) => s + p.usd, 0), pools: top.length, top: top.slice(0, 3) }
}

export interface Concentration { topWallet: number, topWalletName?: string, top10Wallets: number, contractsShare: number }

/** Shares of total supply (0..1) held by the biggest wallet, the top-10 wallets and by contracts (pools, vaults, burn). */
export function concentration(h: Holders, totalSupply: string): Concentration | null {
  const supply = BigInt(totalSupply)
  if (supply <= 0n) return null
  const share = (b: bigint) => Number((b * 1_000_000n) / supply) / 1_000_000
  const wallets = h.addresses.filter(x => x.owner.is_wallet !== false && !/^0:0{64}$/.test(x.owner.address))
  const contracts = h.addresses.filter(x => !wallets.includes(x))
  return {
    topWallet: wallets[0] ? share(BigInt(wallets[0].balance)) : 0,
    topWalletName: wallets[0]?.owner.name,
    top10Wallets: share(wallets.slice(0, 10).reduce((s, x) => s + BigInt(x.balance), 0n)),
    contractsShare: share(contracts.reduce((s, x) => s + BigInt(x.balance), 0n))
  }
}

export type MetadataHome = { kind: 'onchain' } | { kind: 'ipfs', uri: string } | { kind: 'web', uri: string, host: string }

export function metadataHome(content: Record<string, string> | undefined): MetadataHome | null {
  if (!content) return null
  const uri = content.uri
  if (!uri) return { kind: 'onchain' }
  if (/^(ipfs|ar):\/\//i.test(uri)) return { kind: 'ipfs', uri }
  try {
    return { kind: 'web', uri, host: new URL(uri).host }
  }
  catch {
    return { kind: 'web', uri, host: uri }
  }
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 2 : 1)}%`
const usd = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`

export interface TokenInput {
  jetton: TonapiJetton
  holders?: Holders | null
  master?: TcMasters | null
  dex?: DexPairs | null
}

export function tokenChecks({ jetton: j, holders, master, dex }: TokenInput): Check[] {
  const out: Check[] = []
  const raw = j.metadata.address.toLowerCase()
  const sym = j.metadata.symbol ?? '?'
  const verified = j.verification === 'whitelist'
  out.push(trustCheck(j.verification, 'This token'))

  const bait = scamTextReason([j.metadata.name, sym, j.metadata.description].join(' \n '))
  if (bait) out.push({ level: 'danger', title: `Name or description ${bait}`, detail: 'Tokens that advertise a site or a “claim” in their name are phishing bait sent to thousands of wallets.' })
  const copies = verified ? null : impersonates(sym, raw)
  if (copies) out.push({ level: 'danger', title: `Uses the ticker of ${copies}`, detail: 'A different contract with a famous ticker: a fake.' })

  // admin and supply
  const m = master?.jetton_masters[0]
  const admin = j.admin?.address ?? m?.admin_address ?? null
  if (isRenounced(admin)) out.push({ level: 'ok', title: 'Admin renounced', detail: 'Nobody can mint more or change the token contract\'s settings.' })
  else {
    const ifaces = (m && master?.address_book[m.admin_address ?? '']?.interfaces) ?? []
    const multisig = ifaces.some(x => x.startsWith('multisig'))
    out.push({
      level: verified || multisig ? 'info' : 'warn',
      title: multisig ? 'Admin is a multisig wallet' : 'A single wallet is the admin',
      detail: `${multisig ? 'Several keys must approve admin actions. ' : ''}The admin can${j.mintable ? ' mint new tokens,' : ''} change the metadata and hand control to someone else. On custom contracts it may also be able to freeze balances.`
    })
    if (j.mintable && !verified) out.push({ level: 'warn', title: 'Supply can still grow', detail: 'The admin can mint more at any time, diluting holders.' })
  }

  // holders
  if (holders) {
    if (j.holders_count < 100) out.push({ level: 'info', title: `Only ${j.holders_count} holder${j.holders_count === 1 ? '' : 's'}`, detail: 'New or barely traded.' })
    const c = concentration(holders, j.total_supply)
    if (c) {
      const who = c.topWalletName ? ` (${c.topWalletName})` : ''
      const detail = `Top 10 wallets hold ${pct(c.top10Wallets)}; contracts among the top holders shown (DEX pools, vaults) hold ${pct(c.contractsShare)}.`
      // A verified issuer's treasury or a named exchange wallet holding a lot is normal; an anonymous whale is not.
      const big = verified ? 'info' : c.topWalletName ? 'warn' : 'danger'
      if (c.topWallet >= 0.5) out.push({ level: big, title: `One wallet holds ${pct(c.topWallet)} of the supply${who}`, detail: `${detail} ${verified ? 'For a verified token this is usually the issuer\'s treasury.' : 'It can crash the price by selling.'}` })
      else if (c.topWallet >= 0.2) out.push({ level: verified ? 'info' : 'warn', title: `One wallet holds ${pct(c.topWallet)} of the supply${who}`, detail })
      else out.push({ level: 'ok', title: `Largest wallet holds ${pct(c.topWallet)} of the supply${who}`, detail })
    }
  }
  else out.push({ level: 'info', title: 'Holder data unavailable' })

  // liquidity
  const liq = dex === undefined ? null : liquidity(dex, raw)
  if (liq) {
    const where = liq.top.map(p => `${p.pair} on ${p.dex} ${usd(p.usd)}`).join(', ')
    if (!liq.pools) out.push({ level: verified ? 'info' : 'danger', title: 'No DEX pool found', detail: 'DexScreener lists no pool with this token. You may be unable to sell it at any price.' })
    else if (liq.usd < 1000) out.push({ level: 'danger', title: `Almost no liquidity: ${usd(liq.usd)} in ${liq.pools} pool${liq.pools === 1 ? '' : 's'}`, detail: `${where}. Selling even a small amount will move the price a lot.` })
    else if (liq.usd < 50_000) out.push({ level: 'warn', title: `Thin liquidity: ${usd(liq.usd)} in ${liq.pools} pools`, detail: where })
    else out.push({ level: 'ok', title: `${usd(liq.usd)} of DEX liquidity in ${liq.pools} pools`, detail: where })
  }
  else out.push({ level: 'info', title: 'Liquidity data unavailable', detail: 'DexScreener could not be reached, or the site is on testnet (DexScreener covers mainnet only).' })

  // code and metadata (toncenter)
  if (m) {
    const known = KNOWN_WALLET_CODES[m.jetton_wallet_code_hash]
    out.push(known
      ? { level: 'ok', title: 'Common jetton wallet code', detail: known }
      : { level: verified ? 'info' : 'warn', title: 'Uncommon jetton wallet code', detail: `Hash ${m.jetton_wallet_code_hash}. Not one of the codes used by well-known tokens: transfers may follow custom rules (fees, blocks, freezes). Ask the project for audited source code.` })
    const home = metadataHome(m.jetton_content)
    if (home?.kind === 'onchain') out.push({ level: 'ok', title: 'Name and logo stored on-chain' })
    else if (home?.kind === 'ipfs') out.push({ level: 'ok', title: 'Name and logo stored on IPFS (content-addressed)', detail: home.uri })
    else if (home) out.push({ level: 'info', title: `Name and logo hosted on ${home.host}`, detail: `${home.uri}\nWhoever controls that site can change them at any time.` })
  }
  else out.push({ level: 'info', title: 'Contract code data unavailable', detail: 'toncenter could not be reached; the wallet-code and metadata checks were skipped.' })
  return out
}

export type Risk = 'high' | 'medium' | 'low'

export function riskOf(checks: Check[]): Risk {
  if (checks.some(c => c.level === 'danger')) return 'high'
  return checks.filter(c => c.level === 'warn').length >= 2 ? 'medium' : 'low'
}

/** "1,429,976,002.51 USD₮" */
export function supplyLabel(j: TonapiJetton): string {
  return formatJettonAmount(BigInt(j.total_supply), jettonDecimals(j.metadata), { symbol: j.metadata.symbol, maxDecimals: 2 })
}
