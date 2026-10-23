// Vectors: live mainnet config params and real mainnet transactions (fixtures.json, fetched 2026-10-23 from
// toncenter /api/v2/getConfigParam and /api/v2/getTransactions). Expected fees are the values the validators
// wrote into those transactions; the config decode is cross-checked against @ton/ton's own parsers.
import { beginCell, Cell, Dictionary, loadTransaction } from '@ton/core'
import { configParse18, configParseGasLimitsPrices, configParseMsgPrices } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import fx from './fixtures.json'
import { cellStats, currentStoragePrice, fetchFeeConfig, fwdFee, gasFee, paramsFromConfigBoc, parseFeeConfig, splitFwdFee, storageFee, storageFeeFor } from './fees'

const cfg = parseFeeConfig(fx.config)
const slice = (b: string) => Cell.fromBase64(b).beginParse()

function txParts(boc: string) {
  const root = Cell.fromBase64(boc)
  const tx = loadTransaction(root.beginParse())
  const io = root.refs[0]!.beginParse()
  const inMsg = io.loadBit() ? io.loadRef() : null
  const outs = io.loadDict(Dictionary.Keys.Uint(15), Dictionary.Values.Cell()).values()
  if (tx.description.type !== 'generic') throw new Error('not ordinary')
  return { tx, d: tx.description, inMsg, outs }
}

describe('config decode', () => {
  it('matches @ton/ton parsers on live mainnet params', () => {
    const g = configParseGasLimitsPrices(slice(fx.config['21']))
    expect(cfg.gas.basechain).toMatchObject({ flatLimit: g.flatLimit, flatPrice: g.flatGasPrice, gasPrice: g.other.gasPrice, gasLimit: g.other.gasLimit, freezeDueLimit: g.other.freezeDueLimit, deleteDueLimit: g.other.deleteDueLimit })
    const gm = configParseGasLimitsPrices(slice(fx.config['20']))
    expect(cfg.gas.masterchain.gasPrice).toBe(gm.other.gasPrice)
    expect(cfg.gas.masterchain.flatPrice).toBe(gm.flatGasPrice)
    expect(cfg.msg.basechain).toEqual(configParseMsgPrices(slice(fx.config['25'])))
    expect(cfg.msg.masterchain).toEqual(configParseMsgPrices(slice(fx.config['24'])))
    const st = configParse18(slice(fx.config['18']))
    expect(cfg.storage.map(s => [s.utimeSince, s.bitPricePs, s.cellPricePs, s.mcBitPricePs, s.mcCellPricePs]))
      .toEqual(st.map(s => [s.utime_since, s.bit_price_ps, s.cell_price_ps, s.mc_bit_price_ps, s.mc_cell_price_ps]).sort((a, b) => Number(a[0]) - Number(b[0])))
  })

  it('has the documented basechain limits (0.1 / 1 coin due limits)', () => {
    expect(cfg.gas.basechain.freezeDueLimit).toBe(100_000_000n)
    expect(cfg.gas.basechain.deleteDueLimit).toBe(1_000_000_000n)
    expect(cfg.msg.basechain.lumpPrice).toBe(66_667n)
    expect(cfg.msg.basechain.firstFrac).toBe(21_845)
  })
})

describe('gas fee (ceil rounding, like the node)', () => {
  // gas_used -> gas_fees from toncenter v3 /transactions (basechain, 2026-10-23). @ton/ton's computeGasPrices floors and gets 51867.
  const real: [number, number][] = [[62, 6667], [546, 36401], [778, 51868], [1000, 66668], [1756, 117068], [3308, 220534], [4124, 274934], [4939, 329268], [12826, 855068]]
  it.each(real)('%i gas -> %i nano', (gas, fee) => {
    expect(gasFee(BigInt(gas), cfg.gas.basechain)).toBe(BigInt(fee))
  })
  it.each(fx.txs.map(t => [t.lt, t.boc]))('tx %s compute phase', (_lt, boc) => {
    const { d } = txParts(boc)
    if (d.computePhase.type !== 'vm') throw new Error('skipped')
    expect(gasFee(d.computePhase.gasUsed, cfg.gas.basechain)).toBe(d.computePhase.gasFees)
  })
})

describe('forward fees on real transactions', () => {
  it.each(fx.txs.map(t => [t.lt, t.boc]))('tx %s: every out message and action totals', (_lt, boc) => {
    const { d, outs } = txParts(boc)
    expect(outs.length).toBeGreaterThan(0)
    let total = 0n
    let action = 0n
    for (const m of outs) {
      const s = cellStats(m)
      const fee = fwdFee(s.cells, s.bits, cfg.msg.basechain)
      const split = splitFwdFee(fee, cfg.msg.basechain)
      const info = m.beginParse()
      expect(info.loadUint(1)).toBe(0) // int_msg_info
      info.skip(3) // ihr_disabled, bounce, bounced
      info.loadAddress()
      info.loadAddress()
      info.loadCoins()
      info.loadMaybeRef() // extra currencies
      info.loadCoins() // extra_flags / ihr_fee
      expect(split.remaining).toBe(info.loadCoins())
      total += fee
      action += split.action
    }
    expect(d.actionPhase?.totalFwdFees).toBe(total)
    expect(d.actionPhase?.totalActionFees).toBe(action)
  })

  it('import fee of an external message (wallet v4 tx e2360dcb…)', () => {
    const t = fx.txs.find(t => t.lt === '111813283000001')!
    const { tx, d, inMsg } = txParts(t.boc)
    if (d.computePhase.type !== 'vm') throw new Error('skipped')
    const inFwd = tx.totalFees.coins - (d.storagePhase?.storageFeesCollected ?? 0n) - d.computePhase.gasFees - (d.actionPhase?.totalActionFees ?? 0n)
    const s = cellStats(inMsg!)
    expect(fwdFee(s.cells, s.bits, cfg.msg.basechain)).toBe(inFwd)
    expect(inFwd).toBe(101_068n)
  })
})

describe('storage fee', () => {
  // Account EQAMPiXGaw99H_Yf9zxj_wtNljKkfK7kWAISR9ICExnRYTtL (wallet v4): tonapi storage used_cells 22, used_bits 5689.
  // Its txs at utime 1792604821 -> 1792703727 -> 1792742090 collected 4483 and 1739 nano storage (toncenter v3).
  const base = { cells: 22n, bits: 5689n, prices: cfg.storage }
  it('matches storage_fees_collected', () => {
    expect(storageFee({ ...base, lastPaid: 1792703727, now: 1792742090 })).toBe(1739n)
    expect(storageFee({ ...base, lastPaid: 1792604821, now: 1792703727 })).toBe(4483n)
    const t = fx.txs.find(t => t.lt === '111813283000001')!
    expect(txParts(t.boc).d.storagePhase?.storageFeesCollected).toBe(1739n)
  })
  it('single-price projection equals the period walk', () => {
    const p = currentStoragePrice(cfg.storage, 1792742090)!
    expect(storageFeeFor(22n, 5689n, 1792742090 - 1792703727, p)).toBe(1739n)
    expect(storageFee({ ...base, lastPaid: 0, now: 1792742090 })).toBe(0n)
  })
})

describe('config sources', () => {
  // Same layout as tonapi /v2/blockchain/config `raw` (ConfigParams: 256-bit config address + ^Hashmap 32 ^Cell);
  // checked against the live 330 KB mainnet response on 2026-10-23 (params 18/20/21/24/25 hash-equal to getConfigParam).
  const dict = Dictionary.empty(Dictionary.Keys.Int(32), Dictionary.Values.Cell())
  for (const [k, v] of Object.entries(fx.config)) dict.set(Number(k), Cell.fromBase64(v))
  dict.set(0, beginCell().storeUint(1, 256).endCell())
  const dictCell = beginCell().storeDictDirect(dict).endCell()
  const raw = beginCell().storeUint(0x5555, 256).storeRef(dictCell).endCell().toBoc().toString('hex')

  it('extracts the fee params from a full config BOC', () => {
    expect(parseFeeConfig(paramsFromConfigBoc(raw))).toEqual(cfg)
    expect(parseFeeConfig(paramsFromConfigBoc(dictCell.toBoc().toString('hex')))).toEqual(cfg)
  })

  it('falls back to toncenter getConfigParam when tonapi fails', async () => {
    const calls: number[] = []
    const tonapi = async () => { throw new Error('429') }
    const toncenter = async <T>(_m: string, q?: Record<string, number>) => {
      calls.push(q!.config_id!)
      return { config: { bytes: (fx.config as Record<string, string>)[String(q!.config_id)] } } as T
    }
    expect(await fetchFeeConfig(tonapi, toncenter)).toEqual(cfg)
    expect(calls).toEqual([18, 20, 21, 24, 25])
    expect(await fetchFeeConfig(async <T>() => ({ raw }) as T, toncenter)).toEqual(cfg)
    expect(calls).toHaveLength(5)
  })
})
