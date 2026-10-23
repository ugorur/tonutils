// Param cells: toncenter getConfigParam at mc seqno 100816818 (fixtures/config-params.json).
// Expected values: tonapi.io GET /v2/blockchain/config fetched the same minute (independent parser),
// size limits checked field by field against the current block.tlb layout.
import { beginCell, Cell, Dictionary } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { decodeParam, diffConfigs, duration, frac16, splitConfig } from './config'
import fx from './fixtures/config-params.json'

const P = fx.params as Record<string, string>
const cell = (id: string) => Cell.fromBase64(P[id]!)
const dec = (id: number) => decodeParam(id, cell(String(id)))
const json = (id: number) => dec(id).json as Record<string, unknown>

describe('decodeParam (mainnet, tonapi as reference)', () => {
  it('addresses 0 and 1', () => {
    expect(dec(0).json).toBe('-1:5555555555555555555555555555555555555555555555555555555555555555')
    expect(dec(1).json).toBe('-1:3333333333333333333333333333333333333333333333333333333333333333')
    expect(dec(0).fields[0]!.address).toBe(dec(0).json)
  })
  it('5 fee burning 1/2', () => {
    expect(json(5)).toMatchObject({ blackholeAddr: '-1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', feeBurnNominator: 1, feeBurnDenominator: 2 })
    expect(dec(5).fields[0]!.value).toBe('1/2 (50%)')
  })
  it('8 global version 16, capabilities 1006', () => {
    expect(json(8)).toMatchObject({ version: 16, capabilities: 1006n })
    expect(json(8).enabled).toEqual(['Create stats', 'Bounce message body', 'Report version', 'Short dequeue', 'Store out msg queue size', 'Message metadata', 'Deferred messages', 'Full collated data'])
  })
  it('11 voting setup', () => {
    expect(json(11)).toMatchObject({
      normalParams: { minTotalRounds: 2, maxTotalRounds: 6, minWins: 2, maxLoses: 5, minStoreSec: 1000000, maxStoreSec: 10000000, bitPrice: 1, cellPrice: 500 },
      criticalParams: { minTotalRounds: 4, maxTotalRounds: 7, minWins: 3, maxLoses: 5, minStoreSec: 5000000, maxStoreSec: 20000000, bitPrice: 2, cellPrice: 1000 }
    })
  })
  it('12 basechain descriptor', () => {
    const w = (json(12) as Record<string, Record<string, unknown>>)['0']!
    expect(w).toMatchObject({ enabledSince: 1573821854, min_split: 0, max_split: 2, basic: true, active: true, accept_msgs: true, version: 0 })
    expect(w.zerostateRootHash).toBe('55b13f6d0e1d0c34c9c2160f6f918e92d82bf9ddcf8de2e4c94a3fdf39d15446')
    expect(w.zerostateFileHash).toBe('ee0bedfe4b32761fb35e9e1d8818ea720cad1a0e7b4d2ed673c488e72e910342')
  })
  it('15 / 16 / 17 election params', () => {
    expect(json(15)).toEqual({ validatorsElectedFor: 65536, electorsStartBefore: 32768, electorsEndBefore: 8192, stakeHeldFor: 32768 })
    expect(json(16)).toEqual({ maxValidators: 400, maxMainValidators: 100, minValidators: 75 })
    expect(json(17)).toEqual({ minStake: 300000000000000n, maxStake: 10000000000000000n, minTotalStake: 75000000000000000n, maxStakeFactor: 294912 })
    expect(dec(17).fields[3]!.value).toBe('4.5×')
    expect(dec(15).fields[0]!.value).toBe('18 h 12 min')
  })
  it('18 storage prices (two entries)', () => {
    expect(dec(18).json).toEqual([
      { utime_since: 0, bit_price_ps: 1n, cell_price_ps: 500n, mc_bit_price_ps: 1000n, mc_cell_price_ps: 500000n },
      { utime_since: 1777500000, bit_price_ps: 0n, cell_price_ps: 135n, mc_bit_price_ps: 1000n, mc_cell_price_ps: 500000n }
    ])
    // 135 × 31536000 / 65536 = 64962.5 → 64,962 nano per cell per year; bit price 1 → 481 (not "0 per second")
    expect(dec(18).fields[1]!.value).toBe('64,962 nano/cell, 0 nano/bit per year')
    expect(dec(18).fields[0]!.value).toBe('240,600 nano/cell, 481 nano/bit per year')
  })
  it('20 / 21 gas prices', () => {
    expect(json(20)).toEqual({ flatLimit: 100n, flatGasPrice: 1000000n, other: { specialGasLimit: 70000000n, gasPrice: 655360000n, gasLimit: 1000000n, gasCredit: 10000n, blockGasLimit: 2500000n, freezeDueLimit: 100000000n, deleteDueLimit: 1000000000n } })
    expect(json(21)).toEqual({ flatLimit: 100n, flatGasPrice: 6667n, other: { specialGasLimit: 1000000n, gasPrice: 4369067n, gasLimit: 1000000n, gasCredit: 10000n, blockGasLimit: 10000000n, freezeDueLimit: 100000000n, deleteDueLimit: 1000000000n } })
    expect(dec(21).fields[0]!.value).toBe('66.6667 nano per gas unit')
    expect(dec(20).fields[0]!.value).toBe('10,000 nano per gas unit')
  })
  it('24 / 25 message prices', () => {
    expect(json(24)).toEqual({ lumpPrice: 10000000n, bitPrice: 655360000n, cellPrice: 65536000000n, ihrPriceFactor: 98304, firstFrac: 21845, nextFrac: 21845 })
    expect(json(25)).toEqual({ lumpPrice: 66667n, bitPrice: 4369067n, cellPrice: 436906667n, ihrPriceFactor: 98304, firstFrac: 21845, nextFrac: 21845 })
  })
  it('43 size limits v2 per current block.tlb', () => {
    // tonapi agrees on the first seven fields (it labels 2048 with an older field name).
    expect(dec(43).json).toEqual({
      version: 2, max_msg_bits: 2097152, max_msg_cells: 8192, max_library_cells: 200, max_vm_data_depth: 512,
      max_ext_msg_size: 65535, max_ext_msg_depth: 512, max_acc_state_cells: 65536, max_mc_acc_state_cells: 2048,
      max_acc_public_libraries: 256, defer_out_queue_size_limit: 256, max_msg_extra_currencies: 0,
      max_acc_fixed_prefix_length: 8, acc_state_cells_for_storage_dict: 26, max_transaction_library_loads: expect.any(Number)
    })
  })
  it('7 extra currencies to mint (tonapi: 239 → 666666666666, 4294967279 → 1000000000000)', () => {
    expect(dec(7).json).toEqual([{ id: -17, amount: 1000000000000n }, { id: 239, amount: 666666666666n }].sort((a, b) => (a.id >>> 0) - (b.id >>> 0)))
  })
  it('14 block rewards', () => {
    expect(json(14)).toEqual({ masterchainBlockFee: 1700000000n, workchainBlockFee: 1000000000n })
  })
  it('22 / 23 block limits', () => {
    expect(dec(22).json).toEqual({ bytes: { underload: 131072, softLimit: 524288, hardLimit: 1048576 }, gas: { underload: 200000, softLimit: 1000000, hardLimit: 2500000 }, ltDelta: { underload: 1000, softLimit: 5000, hardLimit: 10000 } })
    expect(dec(23).json).toEqual({ bytes: { underload: 262144, softLimit: 1048576, hardLimit: 2097152 }, gas: { underload: 2000000, softLimit: 10000000, hardLimit: 20000000 }, ltDelta: { underload: 1000, softLimit: 5000, hardLimit: 10000 } })
  })
  it('44 suspended addresses (tonapi: 180 accounts until 1803189600)', () => {
    const j = json(44) as { addresses: string[], suspendedUntil: number }
    expect(j.suspendedUntil).toBe(1803189600)
    expect(j.addresses).toHaveLength(180)
    expect(j.addresses).toContain('0:0000000000000000000000000000000000000000000000000000000000000000')
    expect(j.addresses).toContain('0:00ed1c8d25c4774e0ef3fc1c176fcd5e3c3beb2f2b506a73bad9303aea648313')
  })
  it('31 fundamental contracts (tonapi list of 9)', () => {
    expect(dec(31).json).toEqual([
      '-1:0000000000000000000000000000000000000000000000000000000000000000', '-1:3333333333333333333333333333333333333333333333333333333333333333',
      '-1:4d5c0210b35daddaa219fac459dba0fdefb1fae4e97a0d0797739fe050d694ca', '-1:9234809b5b02186e833d082b8a3dbb8225b230ba74a9c06ef24cf334c7a01a34',
      '-1:a8ce6c36aa8ba536b2a5a833098a6c18f9ae3523dcb443f0ac38717dadd8c411', '-1:b74dd9593f9bd8eaa2c514211258a0ea38c71252ebf876362514bc7742c8dfad',
      '-1:c50f890366c81f5c4690c683d894c2940a767fff47da9abb0a4a3c125d4996bf', '-1:dd24c4a1f2b88f8b7053513b5cc6c5a31bc44b2a72dcb4d8c0338af0f0d37ec5',
      '-1:ead7da389bde317c5fb285807ce507baad31c35fe5534b3c418785e901f64c68'
    ])
  })
  it('45 precompiled contracts', () => {
    expect(dec(45).json).toEqual([{ codeHash: '89468f02c78e570802e39979c8516fc38df07ea76a48357e0536f2ba7b3ee37b', gasUsage: 1000n }])
  })
  it('older global version at seqno 60000000 differs', () => {
    const old = decodeParam(8, cell('8@60000000'))
    expect(old.hash).not.toBe(dec(8).hash)
    expect((old.json as { version: number }).version).toBeLessThan(16)
  })
  it('unknown params keep their raw BOC and never throw', () => {
    const p = decodeParam(30, beginCell().storeUint(1, 8).endCell())
    expect(p.json).toBeNull()
    expect(p.boc).toBeTruthy()
    const bad = decodeParam(15, beginCell().storeUint(1, 8).endCell())
    expect(bad.error).toBeTruthy()
  })
})

describe('splitConfig + diffConfigs', () => {
  function configOf(ids: string[], override: Record<number, string> = {}) {
    const d = Dictionary.empty(Dictionary.Keys.Int(32), Dictionary.Values.Cell())
    for (const id of ids) d.set(Number(id), Cell.fromBase64(override[Number(id)] ?? P[id]!))
    return beginCell().storeDictDirect(d).endCell().toBoc().toString('base64')
  }
  it('splits the ConfigParams dictionary and diffs by hash', () => {
    const now = configOf(['0', '8', '15', '17'])
    const before = configOf(['0', '8', '15', '21'], { 8: P['8@60000000']! })
    expect([...splitConfig(now).keys()]).toEqual([0, 8, 15, 17])
    const a = [...splitConfig(before)].map(([id, c]) => decodeParam(id, c))
    const b = [...splitConfig(now)].map(([id, c]) => decodeParam(id, c))
    expect(diffConfigs(a, b).map(c => [c.id, c.kind])).toEqual([[8, 'changed'], [17, 'added'], [21, 'removed']])
  })
  it('lists custom negative params (mainnet has -1000, -999, …) after the standard ones', () => {
    const withCustom = configOf(['0', '8', '15'])
    const d = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell(), Cell.fromBase64(withCustom))
    d.set(-999, Cell.fromBase64(P['0']!))
    const b64 = beginCell().storeDictDirect(d).endCell().toBoc().toString('base64')
    expect([...splitConfig(b64).keys()]).toEqual([0, 8, 15, -999])
    expect(decodeParam(-999, Cell.fromBase64(P['0']!)).about).toContain('Custom param')
  })
})

describe('helpers', () => {
  it('duration / frac16', () => {
    expect(duration(65536)).toBe('18 h 12 min')
    expect(duration(8192)).toBe('2 h 16 min')
    expect(duration(30)).toBe('30 s')
    expect(duration(86400 * 2)).toBe('2 d')
    expect(frac16(294912)).toBe('4.5')
  })
})
