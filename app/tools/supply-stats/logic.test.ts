import { describe, expect, it } from 'vitest'
import { parseGramMarket } from '~/lib/defi-analytics/shared'
import fixture from './fixture-coingecko.json'
import { balancesByRaw, BELIEVERS_FUND, ELECTOR, parseBlockRewards, parseBurningConfig, shareOf } from './logic'

// Mainnet BOCs from toncenter /api/v2/getConfigParam (fetched 2026-10-23). Expected values from tonapi's own
// decoder, GET https://tonapi.io/v2/blockchain/config ("5" and "14"), fetched the same minute.
const P5_MAINNET = 'te6cckEBAQEALAAAUwH//////////////////////////////////////////4AAAACAAAABQNJ1A1s='
const P5_TESTNET = 'te6cckEBAQEALAAAUwH//////////////////////////////////////////4AAAAUAAAAKQMGXl8E='
const P14_MAINNET = 'te6cckEBAQEADAAAFGtGVT8QBDuaygAdKEQV'

describe('parseBurningConfig', () => {
  it('decodes mainnet ConfigParam 5 like tonapi (blackhole -1:ff…ff, 1/2 of fees burned)', () => {
    expect(parseBurningConfig(P5_MAINNET)).toEqual({ blackhole: `-1:${'f'.repeat(64)}`, num: 1, denom: 2, share: 0.5 })
  })
  it('keeps the raw fraction (testnet: 10/20, per testnet.tonapi.io/v2/blockchain/config)', () => {
    expect(parseBurningConfig(P5_TESTNET)).toMatchObject({ num: 10, denom: 20, share: 0.5 })
  })
  it('rejects another param', () => {
    expect(() => parseBurningConfig(P14_MAINNET)).toThrow(/tag 0x6b/)
  })
})

describe('parseBlockRewards', () => {
  it('decodes mainnet ConfigParam 14 like tonapi (1.7 GRAM per masterchain block, 1 GRAM per basechain block)', () => {
    expect(parseBlockRewards(P14_MAINNET)).toEqual({ masterchain: 1700000000n, basechain: 1000000000n })
  })
})

describe('market + balances', () => {
  // CoinGecko /api/v3/coins/the-open-network (trimmed), fetched 2026-10-23.
  const m = parseGramMarket(fixture)

  it('reads the CoinGecko coin payload', () => {
    expect(m).toMatchObject({ name: 'Gram (prev. Toncoin)', priceUsd: 1.32, marketCapUsd: 3745295940, fdvUsd: 6968069828, rank: 31, totalSupply: 5271060131.261505, circulatingSupply: 2833163357.1244097, maxSupply: null })
  })

  // toncenter /api/v3/accountStates for the elector and the TON Believers Fund, fetched 2026-10-23.
  const balances = balancesByRaw({
    accounts: [
      { address: '-1:3333333333333333333333333333333333333333333333333333333333333333', balance: '1376411569819584392', status: 'active' },
      { address: '0:ED1691307050047117B998B561D8DE82D31FBF84910CED6EB5FC92E7485EF8A7', balance: '1245901672547880944', status: 'active' }
    ]
  })

  it('keys balances by lowercase raw address and computes the share of total supply', () => {
    expect(balances.get(ELECTOR)).toBe(1376411569819584392n)
    expect(balances.get(BELIEVERS_FUND)).toBe(1245901672547880944n)
    // 1376411569.819584392 / 5271060131.261505 = 0.26112...
    expect(shareOf(balances.get(ELECTOR)!, m.totalSupply)).toBeCloseTo(0.261126, 5)
    expect(shareOf(1n, 0)).toBeNull()
  })
})
