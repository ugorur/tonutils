// Facts about the Toncoin → Gram rename and a red-flag scanner for "migration" scam messages.
// Market names were checked on 2026-10-23 against each venue's public API (see TICKERS[].checked).

export const RENAME_DATE = '2026-06-15'

export interface Ticker {
  venue: string
  /** What you search for there now */
  name: string
  note?: string
  url: string
}

export const TICKERS: readonly Ticker[] = [
  { venue: 'Binance', name: 'GRAMUSDT', note: 'The old TONUSDT pair has an empty order book; its last price is stale.', url: 'https://www.binance.com/en/trade/GRAM_USDT' },
  { venue: 'OKX', name: 'GRAM-USDT', note: 'TON-USDT no longer exists.', url: 'https://www.okx.com/trade-spot/gram-usdt' },
  { venue: 'Bybit', name: 'GRAMUSDT', note: 'TONUSDT no longer exists.', url: 'https://www.bybit.com/trade/spot/GRAM/USDT' },
  { venue: 'Kraken', name: 'TONUSD', note: 'Still listed under the old ticker (same coin).', url: 'https://www.kraken.com/prices/toncoin' },
  { venue: 'CoinGecko', name: 'Gram (prev. Toncoin) · GRAM', note: 'API id is still the-open-network.', url: 'https://www.coingecko.com/en/coins/the-open-network' },
  { venue: 'CoinPaprika', name: 'Gram (prev. Toncoin) · GRAM', url: 'https://coinpaprika.com/coin/toncoin-the-open-network/' }
]

export interface RedFlag {
  id: string
  title: string
  why: string
  /** The text that triggered it */
  match: string
}

const RULES: { id: string, title: string, why: string, re: RegExp }[] = [
  {
    id: 'migration',
    title: 'Asks you to migrate, swap or convert to GRAM',
    why: 'There is no migration. Your existing coins already are GRAM: same wallet, same address, same balance.',
    re: /\b(migrat\w*|swap\w*|conver\w*|upgrad\w*|bridg\w*|exchang\w*|re-?issu\w*|replac\w*)\b[^\n]{0,80}\bgrams?\b|\bgrams?\b[^\n]{0,40}\b(migration|swap|conversion|upgrade|bridge)\b/i
  },
  {
    id: 'secret',
    title: 'Mentions your recovery phrase or private key',
    why: 'Nobody legitimate ever needs your 12 or 24 recovery words or private key. Anyone who has them can take everything.',
    re: /\b(seed|recovery|secret|backup|mnemonic)\s*(phrase|words?|key)\b|\b(12|24)[\s-]words?\b|\bprivate\s+key\b|\bmnemonic\b/i
  },
  {
    id: 'claim',
    title: 'Offers a GRAM claim, airdrop or bonus for the rename',
    why: 'Holders received nothing extra because nothing changed on-chain. "Claim your GRAM" pages drain wallets.',
    re: /\b(claim\w*|airdrop\w*|bonus\w*|rewards?|free|reserve)\b[^\n]{0,60}\bgrams?\b|\bgrams?\b[^\n]{0,60}\b(claim|airdrop|bonus)\b/i
  },
  {
    id: 'send-first',
    title: 'Asks you to send coins first to get something back',
    why: 'Sending coins "to receive GRAM", "to verify" or "to double" them is the most common crypto scam. Transfers cannot be reversed.',
    re: /\b(send|deposit|transfer|pay)\b[^\n]{0,60}\b(ton|toncoin|grams?|usdt)\b[^\n]{0,80}\b(receive|get|back|return\w*|double\w*|verif\w*|activat\w*)\b/i
  },
  {
    id: 'connect',
    title: 'Asks you to connect or verify your wallet on a site',
    why: 'Connecting a wallet and approving a "migration" transaction can hand over your funds. You do not need to visit any site for the rename.',
    re: /\b(connect|verify|validate|sync\w*|link|authori[sz]e)\s+(your\s+)?(ton\s+)?wallets?\b/i
  },
  {
    id: 'loss',
    title: 'Threatens that your coins will be lost, frozen or worthless',
    why: 'Coins do not expire because of a name change. Threats of loss are there to rush you.',
    re: /\b(lose|lost|worthless|invalid\w*|frozen|freez\w*|deactivat\w*|expir\w*|burn\w*|blocked)\b[^\n]{0,60}\b(ton|toncoin|coins?|balance|tokens?|funds)\b|\b(ton|toncoin|coins?|balance|tokens?|funds)\b[^\n]{0,40}\b(will be|become)\s+(lost|worthless|invalid|frozen|deactivated|burned|blocked)\b/i
  },
  {
    id: 'urgency',
    title: 'Creates urgency',
    why: 'Deadlines and "last chance" wording are pressure tactics. The rename needs no action at any time.',
    re: /\b(deadline|last chance|urgent\w*|immediately|asap|act now|hurry|only \d+ (hours?|days?) left|within \d+ (hours?|days?|minutes?))\b/i
  }
]

/** Scans a message for the patterns used by "TON → GRAM migration" scams. Runs locally. */
export function scanMessage(text: string): RedFlag[] {
  const flags: RedFlag[] = []
  for (const r of RULES) {
    const m = r.re.exec(text)
    if (m) flags.push({ id: r.id, title: r.title, why: r.why, match: m[0].trim() })
  }
  return flags
}
