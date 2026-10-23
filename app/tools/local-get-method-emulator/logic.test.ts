import * as tasm from '@ton/tasm'
import { Address, beginCell, Cell, parseTuple, serializeTuple, TupleReader } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { fetchAccountState, type ToncenterClient } from '~/lib/tvm-wasm/code'
import type { GetMethodArgs } from '~/utils/lazy'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import { availableMethods, buildRun, exitInfo, parseMethod } from './logic'
import walletAcc from './fixtures/wallet-account.json'
import walletSeqno from './fixtures/wallet-seqno.json'
import walletPubkey from './fixtures/wallet-pubkey.json'
import usdtWalletAcc from './fixtures/usdt-wallet-account.json'
import usdtWalletData from './fixtures/usdt-wallet-data.json'
import usdtLibrary from './fixtures/usdt-wallet-library.json'
import usdtMasterAcc from './fixtures/usdt-master-account.json'
import usdtWalletAddress from './fixtures/usdt-get-wallet-address.json'

// Fixtures (mainnet, fetched 2026-10-22 from toncenter, same block window for state and result):
// - wallet-*.json: v4r2 wallet 0:CE3A368FE3CEECB5F93D137F267B62ECBAE9D1F7726D898DDD19F3D6394387F5,
//   /api/v3/account + /api/v3/runGetMethod seqno and get_public_key.
// - usdt-wallet-*.json: USD₮ jetton wallet 0:0000005CECBDC23E9FE415D530ADEE667EF35B4D3DB4CC49088B4F319179A86F (code is a
//   library cell), /api/v3/account + runGetMethod get_wallet_data + /api/v2/getLibraries.
// - usdt-master-account.json / usdt-get-wallet-address.json: USD₮ master EQCxE6…sDs, /api/v3/account and
//   runGetMethod get_wallet_address(owner from get_wallet_data).
// The expected values are toncenter's (the real node's) results; our local emulation must reproduce them.

const W = Address.parse('0:CE3A368FE3CEECB5F93D137F267B62ECBAE9D1F7726D898DDD19F3D6394387F5')
const J = Address.parse('0:0000005CECBDC23E9FE415D530ADEE667EF35B4D3DB4CC49088B4F319179A86F')
const M = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')

const client = (acc: { code: string | null, data: string | null, balance: string, status: string }): ToncenterClient => ({
  v2: async <T>() => usdtLibrary.result as T,
  v3: async <T>() => acc as T
})

/** Same conversion loadSandbox() does before posting to the worker; the handler is the code the worker runs. */
async function emulate(a: GetMethodArgs) {
  const b64 = (c: Cell | string) => (typeof c === 'string' ? c : c.toBoc().toString('base64'))
  const res = await sandboxHandlers.runGetMethod({
    code: b64(a.code),
    data: b64(a.data),
    address: (a.address as Address).toRawString(),
    method: a.method,
    stack: a.stack?.length ? serializeTuple(a.stack).toBoc().toString('base64') : undefined,
    balance: (a.balance ?? 0n).toString(),
    libs: a.libs ? b64(a.libs) : undefined,
    unixTime: a.unixTime,
    gasLimit: a.gasLimit?.toString()
  })
  if (!res.output.success) throw new Error(res.output.error)
  return { exit: res.output.vm_exit_code, gas: Number(res.output.gas_used), reader: new TupleReader(parseTuple(Cell.fromBase64(res.output.stack))), missing: res.output.missing_library }
}

const cellOf = (b64: string) => Cell.fromBase64(b64)

describe('local emulation matches the network (toncenter runGetMethod)', () => {
  it('v4r2 wallet: seqno and get_public_key, same gas', async () => {
    const state = await fetchAccountState(client(walletAcc), W)
    for (const [method, fx] of [['seqno', walletSeqno], ['get_public_key', walletPubkey]] as const) {
      const r = await emulate(buildRun(state, method, []).args)
      expect(r.exit).toBe(fx.exit_code)
      expect(r.reader.readBigNumber()).toBe(BigInt(fx.stack[0]!.value))
      expect(r.gas).toBe(fx.gas_used)
    }
  }, 60_000)

  it('USD₮ jetton wallet with library code: get_wallet_data', async () => {
    const state = await fetchAccountState(client(usdtWalletAcc), J)
    expect(state.libs).toHaveLength(1)
    const r = await emulate(buildRun(state, 'get_wallet_data', []).args)
    expect(r.exit).toBe(0)
    expect(r.missing).toBeFalsy()
    expect(r.gas).toBe(usdtWalletData.gas_used)
    expect(r.reader.readBigNumber()).toBe(BigInt(usdtWalletData.stack[0]!.value))
    for (const e of usdtWalletData.stack.slice(1)) expect(r.reader.readCell().equals(cellOf(e.value))).toBe(true)
  }, 60_000)

  it('USD₮ master: get_wallet_address(owner) returns that jetton wallet', async () => {
    const state = await fetchAccountState(client(usdtMasterAcc), M)
    const owner = cellOf(usdtWalletData.stack[1]!.value).beginParse().loadAddress()
    const r = await emulate(buildRun(state, '0x19379', [{ type: 'address', value: owner.toString() }]).args) // 103289 = get_wallet_address
    expect(r.exit).toBe(0)
    expect(r.gas).toBe(usdtWalletAddress.gas_used)
    const addr = r.reader.readAddress()
    expect(addr.equals(cellOf(usdtWalletAddress.stack[0]!.value).beginParse().loadAddress())).toBe(true)
    expect(addr.equals(J)).toBe(true)
  }, 60_000)

  it('without the library the emulator reports it missing (why libraries are fetched)', async () => {
    const state = await fetchAccountState(client(usdtWalletAcc), J)
    const r = await emulate(buildRun({ ...state, libs: [] }, 'get_wallet_data', []).args)
    expect(r.exit).not.toBe(0)
    expect(r.missing).toBe('8F452D7A4DFD74066B682365177259ED05734435BE76B5FD4BD5D8AF2B7C3D68')
  }, 60_000)
})

describe('what-if overrides', () => {
  it('data override: a v4 data cell with seqno 1000 returns 1000', async () => {
    const state = await fetchAccountState(client(walletAcc), W)
    const s = state.data.beginParse().skip(32) // v4r2 storage: seqno:uint32 subwallet:uint32 pubkey:bits256 plugins:dict
    const data = beginCell().storeUint(1000, 32).storeSlice(s).endCell().toBoc().toString('base64')
    const plan = buildRun(state, 'seqno', [], { data })
    expect(plan.overridden).toEqual(['data'])
    expect((await emulate(plan.args)).reader.readNumber()).toBe(1000)
  }, 60_000)

  it('balance, time and gas overrides reach the VM (BALANCE / NOW / out of gas, TVM spec; FIRST is INDEX 0 in TASM)', async () => {
    const parsed = tasm.text.parse('x', 'DROP\nBALANCE\nINDEX 0\nNOW')
    if (parsed.$ !== 'ParseSuccess') throw new Error(parsed.error.msg)
    const code = tasm.runtime.compileCell(parsed.instructions)
    const state = { address: W, balance: 5n, code, data: beginCell().endCell(), libs: [] }
    const r = await emulate(buildRun(state, '0', [], { balance: 123456789n, unixTime: 1_700_000_000 }).args)
    expect(r.exit).toBe(0)
    expect(r.reader.readBigNumber()).toBe(123456789n)
    expect(r.reader.readNumber()).toBe(1_700_000_000)
    const low = await emulate(buildRun(state, '0', [], { gasLimit: 10n }).args)
    expect(low.exit).toBe(-14)
  }, 60_000)

  it('unchanged overrides are not reported as overrides', () => {
    const state = { address: W, balance: 5n, code: beginCell().endCell(), data: beginCell().storeUint(1, 8).endCell(), libs: [] }
    expect(buildRun(state, 'seqno', [], { data: state.data.toBoc().toString('base64'), balance: 5n }).overridden).toEqual([])
    expect(() => buildRun(state, 'seqno', [], { code: 'zzz' })).toThrow(/Code override/)
  })
})

describe('parseMethod / availableMethods / exitInfo', () => {
  it('parses names (crc16 ids, matching tonapi /inspect ids) and numeric ids', () => {
    expect(parseMethod('seqno')).toEqual({ id: 85143, name: 'seqno' })
    expect(parseMethod('get_wallet_address').id).toBe(103289)
    expect(parseMethod('103289')).toEqual({ id: 103289, name: 'get_wallet_address' })
    expect(parseMethod('0x14C97')).toEqual({ id: 85143, name: 'seqno' })
    expect(parseMethod('-1').name).toBe('recv_external')
    expect(() => parseMethod('')).toThrow(/Enter/)
    expect(() => parseMethod('get data')).toThrow(/not a valid/)
  })

  it('lists the get-methods of real code, resolving the library first', async () => {
    const state = await fetchAccountState(client(usdtWalletAcc), J)
    const names = availableMethods(tasm, state.code, state.libs).map(m => m.name)
    expect(names).toEqual(expect.arrayContaining(['get_wallet_data', 'get_status']))
    expect(names).not.toContain('recv_internal')
  })

  it('explains exit codes', () => {
    expect(exitInfo(0).ok).toBe(true)
    expect(exitInfo(11)).toMatchObject({ ok: false })
    expect(exitInfo(-14).text).toMatch(/gas/i)
  })
})
