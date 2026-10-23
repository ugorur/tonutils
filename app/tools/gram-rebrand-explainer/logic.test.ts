import { describe, expect, it } from 'vitest'
import { COIN_FORMER, COIN_SYMBOL, NANO_PER_COIN } from '~/utils/currency'
import { RENAME_DATE, TICKERS, scanMessage } from './logic'

// Facts: CoinGecko /coins/the-open-network returns name "Gram (prev. Toncoin)", symbol "gram";
// Binance GRAMUSDT, OKX GRAM-USDT, Bybit GRAMUSDT return live prices and Kraken still answers TONUSD (curl, 2026-10-23).
// Scam phrases below follow the wording warned about in exchange rename notices (KuCoin, Kaiko, June 2026).

const ids = (t: string) => scanMessage(t).map(f => f.id)

describe('rename facts', () => {
  it('matches the shared currency constants', () => {
    expect(COIN_SYMBOL).toBe('GRAM')
    expect(COIN_FORMER).toBe('Toncoin')
    expect(NANO_PER_COIN).toBe(1_000_000_000n)
    expect(RENAME_DATE).toBe('2026-06-15')
  })

  it('lists the verified market names', () => {
    const byVenue = Object.fromEntries(TICKERS.map(t => [t.venue, t.name]))
    expect(byVenue).toMatchObject({ Binance: 'GRAMUSDT', OKX: 'GRAM-USDT', Bybit: 'GRAMUSDT', Kraken: 'TONUSD' })
    for (const t of TICKERS) expect(t.url).toMatch(/^https:\/\//)
  })
})

describe('scanMessage', () => {
  it('flags a typical migration scam', () => {
    const msg = 'URGENT: Toncoin is being replaced. Migrate your TON to GRAM before the deadline or your coins will be lost. Connect your wallet at ton-gram-swap.example and enter your 24 words to verify.'
    expect(ids(msg)).toEqual(['migration', 'secret', 'connect', 'loss', 'urgency'])
  })

  it('flags claim and send-first scams', () => {
    expect(ids('Claim your free GRAM airdrop now!')).toContain('claim')
    expect(ids('Send 100 TON to this address and receive 200 GRAM back')).toContain('send-first')
  })

  it('flags seed phrase requests on their own', () => {
    expect(ids('Support: please share your recovery phrase so we can update your wallet')).toEqual(['secret'])
  })

  it('does not flag a neutral price message', () => {
    expect(ids('GRAM price today is $1.31 on Binance, up 2% this week.')).toEqual([])
    expect(ids('')).toEqual([])
  })

  it('returns the matched text for each flag', () => {
    const [flag] = scanMessage('Please swap your Toncoin for GRAM tokens')
    expect(flag?.match).toMatch(/swap your Toncoin for GRAM/i)
  })
})
