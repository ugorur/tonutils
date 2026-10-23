import { Address, Cell, parseTuple, TupleReader } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { fetchAccountAt, fetchLibraries, libraryRef, libsDict, mcBlockAt, parseShardAccount } from '~/lib/accounts-history/state'
import type { V2Fetch } from '~/utils/api-client'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import { exitCodeHint, formatStack, parseArgs, parseWhen, suggestMethods } from './logic'

const b64hex = (b: string) => Buffer.from(b, 'base64').toString('hex')

// toncenter v2 getShardAccountCell?address=EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N&seqno=35122647
// (masterchain block from lookupBlock unixtime=1704067200, gen_utime 1704067202), fetched 2026-10-22.
const FOUNDATION = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'
const FOUNDATION_2024 = 'te6cckECBAEAAQUAAVC/8+/QvFDDkZ/D2ROnkRoPbJia+gByDjoauS6IGC0oywAAJ5L76BdDAQJ1wAg9/VUuY3KbRy/LzIxF68xmkXAlWLaOx1J+G6QDoPMaggaBTsMsZEuoAACeS++gXRHWsYyl9bD/00ACAwDe/wAg3SCCAUyXuiGCATOcurGfcbDtRNDTH9MfMdcL/+ME4KTyYIMI1xgg0x/TH9Mf+CMTu/Jj7UTQ0x/TH9P/0VEyuvKhUUS68qIE+QFUEFX5EPKj+ACTINdKltMH1AL7AOjRAaTIyx/LH8v/ye1UAFAAAAEfKamjF3LJ7WtipuLroUqTuQRi56Nnd3vrijj7FbnzOETSLOL/CQIrsQ=='

// toncenter v2 getShardAccountCell (latest) for the USD₮ jetton wallet 0:5CA2…B17B, fetched 2026-10-22.
// Its code is a library cell; the library body comes from v2 getLibraries.
const USDT_WALLET = '0:5CA2181B03C0F7D0D6B60B56506EF19DED20A43877240CEE6C5E9D87CD1FB17B'
const USDT_WALLET_STATE = 'te6cckEBBAEA0wABUJiN10IiFNYrECc6P2zk0I/pQNEWs15jiLujax9s/ORuAABkkrbOqccBAm3ABcohgbA8D30Na2C1ZQbvGd7SCkOHckDO5sXp2HzR+xeyBoDqQ1acdogAAZJK2zqnJMOx9hNAAgMIQgKPRS16Tf10BmtoI2UXclntBXNENb52tf1L1divK3w9aACPBAGTHJ2ABniC0sh7HNjmtrHZhJGhJuddoUo2DYWiuA8REe7B5aewAsROplLUCShZxn2kTkyjrdZWWw4ol9ZAosUb+zcNiHf69Rf7eQ=='
const USDT_LIB_HASH = '8f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68'

describe('parseShardAccount (on-chain vectors)', () => {
  it('reads the TON Foundation (OLD) wallet as of 2024-01-01', () => {
    const s = parseShardAccount(FOUNDATION_2024)
    // Independent: toncenter v3 /transactions?account=…&end_utime=1704067202&limit=1 (last tx before the block):
    // hash v/Pv0LxQ…, lt 43512245000003, account_state_after.balance 25550668502057983.
    expect(s.status).toBe('active')
    expect(s.balance).toBe(25550668502057983n)
    expect(s.lastTxLt).toBe('43512245000003')
    expect(s.lastTxHash).toBe(b64hex('v/Pv0LxQw5Gfw9kTp5EaD2yYmvoAcg46GrkuiBgtKMs='))
    expect(s.codeHash).toBe(b64hex('hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk='))
    expect(s.dataHash).toBe(b64hex('2ESKcipepI8jrurH57Wq9I+dc1+EFsZUtcnqSghNCMc='))
    expect(suggestMethods(s).wallet).toBe('Wallet v3R2')
  })

  it('runs get_public_key on the historical state in the TVM emulator', async () => {
    const s = parseShardAccount(FOUNDATION_2024)
    const res = await sandboxHandlers.runGetMethod({
      code: s.code!.toBoc().toString('base64'),
      data: s.data!.toBoc().toString('base64'),
      address: Address.parse(FOUNDATION).toRawString(),
      method: 'get_public_key',
      unixTime: 1704067202
    })
    expect(res.output.success).toBe(true)
    if (!res.output.success) return
    const r = new TupleReader(parseTuple(Cell.fromBase64(res.output.stack)))
    // Independent: tonapi /v2/accounts/EQCD39…/publickey
    expect(r.readBigNumber().toString(16)).toBe('72c9ed6b62a6e2eba14a93b90462e7a367777beb8a38fb15b9f33844d22ce2ff')
  }, 60_000)

  it('resolves a library-cell code (USD₮ jetton wallet) and runs get_wallet_data', async () => {
    const s = parseShardAccount(USDT_WALLET_STATE)
    // Independent: toncenter v3 /jetton/wallets?address=… last_transaction_lt 110581295000007, balance 26418333.
    expect(s.lastTxLt).toBe('110581295000007')
    expect(libraryRef(s.code!)).toBe(USDT_LIB_HASH)

    const libBody = await import('./fixtures/usdt-lib.json').then(m => m.default as string)
    const v2: V2Fetch = async <T>(method: string, q?: Record<string, unknown>) => {
      expect(method).toBe('getLibraries')
      expect(q?.libraries).toBe(USDT_LIB_HASH)
      return { result: [{ hash: '', data: libBody }] } as T
    }
    const libs = await fetchLibraries(v2, [USDT_LIB_HASH])
    const res = await sandboxHandlers.runGetMethod({
      code: s.code!.toBoc().toString('base64'),
      data: s.data!.toBoc().toString('base64'),
      address: USDT_WALLET,
      method: 'get_wallet_data',
      libs: libsDict(libs)!.toBoc().toString('base64')
    })
    expect(res.output.success).toBe(true)
    if (!res.output.success) return
    const r = new TupleReader(parseTuple(Cell.fromBase64(res.output.stack)))
    expect(r.readBigNumber()).toBe(26418333n)
    // v3 owner 0:33C4…2D3D, jetton master 0:B113…1DFE (USD₮)
    expect(r.readAddress().toRawString()).toBe('0:33c4169643d8e6c735b58ecc248d09373aed0a51b06c2d15c078888f760f2d3d')
    expect(r.readAddress().toRawString()).toBe('0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe')
  }, 60_000)
})

describe('fetch helpers', () => {
  it('maps a date to a masterchain block and reads the account there', async () => {
    const calls: string[] = []
    const v2: V2Fetch = async <T>(method: string, q?: Record<string, unknown>) => {
      calls.push(`${method}:${JSON.stringify(q)}`)
      if (method === 'lookupBlock') return { seqno: 35122647 } as T
      if (method === 'getBlockHeader') return { gen_utime: 1704067202 } as T
      return { bytes: FOUNDATION_2024 } as T
    }
    const b = await mcBlockAt(v2, 1704067200)
    expect(b).toEqual({ seqno: 35122647, utime: 1704067202 })
    const s = await fetchAccountAt(v2, FOUNDATION, b.seqno)
    expect(s.balance).toBe(25550668502057983n)
    expect(calls[0]).toContain('"unixtime":1704067200')
    expect(calls[0]).toContain('"shard":"-9223372036854775808"')
    expect(calls[2]).toContain('"seqno":35122647')
  })
})

describe('arguments and stack', () => {
  it('parses ints, hex, addresses and BOCs', () => {
    const items = parseArgs('42, -0x10\nEQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')
    expect(items[0]).toEqual({ type: 'int', value: 42n })
    expect(items[1]).toEqual({ type: 'int', value: -16n })
    expect(items[2]!.type).toBe('slice')
    expect(() => parseArgs('hello')).toThrow(/not a number/)
  })

  it('formats ints in decimal and hex and shows address slices', () => {
    const [addr] = parseArgs(FOUNDATION)
    const rows = formatStack([{ type: 'int', value: 255n }, addr!, { type: 'null' }])
    expect(rows[0]).toEqual({ type: 'int', value: '255', alt: '0xff' })
    expect(rows[1]!.alt).toBe(FOUNDATION)
    expect(rows[2]!.value).toBe('null')
  })

  it('date input and exit codes', () => {
    expect(parseWhen('2024-01-01T00:00:00Z')).toBe(1704067200)
    expect(parseWhen('nope')).toBeNull()
    expect(exitCodeHint(0)).toBeNull()
    expect(exitCodeHint(11)).toMatch(/no get-method/)
  })
})
