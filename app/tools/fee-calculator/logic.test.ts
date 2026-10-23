// Expected values are what validators charged in mainnet tx 91671f17… (see EXAMPLE), with live config params
// from toncenter getConfigParam (app/lib/fees-time/fixtures.json). Node-exact math is tested in app/lib/fees-time/fees.test.ts.
import { describe, expect, it } from 'vitest'
import fx from '~/lib/fees-time/fixtures.json'
import { parseFeeConfig } from '~/lib/fees-time/fees'
import { bocStats, computeFees, EXAMPLE, parseCount, per16, priceRows, toSeconds } from './logic'

const cfg = parseFeeConfig(fx.config)

describe('fee calculator', () => {
  it('reproduces every fee of the example mainnet transaction', () => {
    const msg = bocStats(EXAMPLE.messageBoc, 'message')
    expect(msg).toEqual({ cells: 3n, bits: 1064n })
    const r = computeFees(cfg, 'basechain', {
      gas: parseCount(EXAMPLE.gas),
      msg,
      storage: { cells: 22n, bits: 5697n, seconds: toSeconds(EXAMPLE.storageSeconds, 'seconds')! }
    }, EXAMPLE.utime)
    expect(r.gas).toBe(EXAMPLE.onChain.gas)
    expect(r.fwd).toEqual({ total: EXAMPLE.onChain.fwdTotal, action: EXAMPLE.onChain.fwdAction, remaining: EXAMPLE.onChain.fwdRemaining })
    expect(r.storage).toBe(EXAMPLE.onChain.storage)
    expect(r.total).toBe(220534n + 157601n + 19n)
  })

  it('body kinds: a ref body pays for its root, an inline body does not', () => {
    // The example message stores its body (jetton transfer) as a ref: that ref is the body.
    const body = bocStats(EXAMPLE.messageBoc, 'message')
    expect(bocStats(EXAMPLE.messageBoc, 'body-inline')).toEqual(body)
    expect(bocStats(EXAMPLE.messageBoc, 'body-ref').cells).toBe(body.cells + 1n)
  })

  it('a message with no extra cells costs exactly the lump price (66667 on mainnet)', () => {
    expect(computeFees(cfg, 'basechain', { gas: null, msg: { cells: 0n, bits: 0n }, storage: null }).fwd)
      .toEqual({ total: 66667n, action: 22221n, remaining: 44446n }) // mainnet tx 4jYNyzwt… out message fwd_fee 44446
  })

  it('masterchain uses config 20/24', () => {
    const r = computeFees(cfg, 'masterchain', { gas: 100n, msg: { cells: 0n, bits: 0n }, storage: null })
    expect(r.gas).toBe(cfg.gas.masterchain.flatPrice)
    expect(r.fwd?.total).toBe(cfg.msg.masterchain.lumpPrice)
  })

  it('parses inputs', () => {
    expect(parseCount('3 308')).toBe(3308n)
    expect(parseCount('1,000,000')).toBe(1000000n)
    expect(parseCount('-1')).toBeNull()
    expect(parseCount('1.5')).toBeNull()
    expect(toSeconds('2', 'days')).toBe(172800)
    expect(toSeconds('1', 'years')).toBe(31536000)
    expect(toSeconds('', 'days')).toBeNull()
    expect(() => bocStats('nope', 'message')).toThrow(/Not a valid BOC/)
  })

  it('formats 2^16-scaled prices', () => {
    expect(per16(4369067n)).toBe('66.6667')
    expect(per16(436906667n)).toBe('6,666.6667')
    expect(per16(655360000n)).toBe('10,000')
    expect(priceRows(cfg, 'basechain', EXAMPLE.utime)).toHaveLength(8)
  })
})
