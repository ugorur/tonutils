import * as tasm from '@ton/tasm'
import { Address, Cell, getMethodId } from '@ton/core'
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import { effectiveCode, fetchAccountState, fetchLibraries, libraryHashes, parseCodeSource, type ToncenterClient } from '~/lib/tvm-wasm/code'
import { annotateMethods, compareCode, diffLines, disassemble } from './logic'
import master from './fixtures/usdt-master-inspect.json'
import walletInspect from './fixtures/usdt-wallet-inspect.json'
import library from './fixtures/usdt-wallet-library.json'

// Fixtures: tonapi GET /v2/blockchain/accounts/{id}/inspect for the USD₮ master EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
// and one USD₮ jetton wallet 0:0000005CECBDC23E9FE415D530ADEE667EF35B4D3DB4CC49088B4F319179A86F (code = a library cell),
// plus toncenter /api/v2/getLibraries for that library (all fetched 2026-10-22). Wallet codes come from @ton/ton.
const USDT_WALLET = Address.parse('0:0000005CECBDC23E9FE415D530ADEE667EF35B4D3DB4CC49088B4F319179A86F')

describe('disassemble', () => {
  const code = Cell.fromHex(master.code)
  const d = disassemble(tasm, code, master.methods)

  it('produces the same text as tonapi /inspect (besides our method-name comments)', () => {
    expect(code.hash().toString('hex')).toBe(master.code_hash)
    expect(d.text.replace(/ \/\/ [\w?]+$/gm, '')).toBe(master.disassembled_code.trimEnd())
  })

  it('round-trips: tonapi text and our annotated text both assemble to the on-chain code hash', () => {
    for (const src of [master.disassembled_code, d.text]) {
      const p = tasm.text.parse('x.tasm', src)
      expect(p.$).toBe('ParseSuccess')
      if (p.$ === 'ParseSuccess') expect(tasm.runtime.compileCell(p.instructions).hash().toString('hex')).toBe(master.code_hash)
    }
  })

  it('lists recv_internal and every get-method tonapi reports, with names', () => {
    const named = d.methods.filter(m => m.kind === 'get').map(m => [m.id, m.name])
    expect(named).toEqual(expect.arrayContaining(master.methods.map(m => [m.id, m.method])))
    expect(d.methods.find(m => m.id === 0)?.name).toBe('recv_internal')
    expect(d.text).toContain('    103289 => { // get_wallet_address')
  })

  it('names well-known methods without tonapi (crc16 ids match tonapi)', () => {
    const plain = disassemble(tasm, code)
    for (const m of master.methods) expect(plain.methods.find(x => x.id === m.id)?.name).toBe(m.method)
    for (const m of walletInspect.methods) expect(getMethodId(m.method)).toBe(m.id)
  })

  it('marks small unnamed ids as internal procs (tonapi text calls id 20 with CALLDICT), not get-methods', () => {
    expect(master.disassembled_code).toMatch(/CALLDICT(_LONG)? 20\b/)
    expect(d.methods.find(m => m.id === 20)).toMatchObject({ name: null, kind: 'proc' })
    expect(d.methods.filter(m => m.kind === 'get').map(m => m.id).sort()).toEqual(master.methods.map(m => m.id).sort())
  })

  it('annotates only top-level method lines', () => {
    expect(annotateMethods('    0 => {\n        5 => {', new Map([[0, 'recv_internal'], [5, 'x']]))).toBe('    0 => { // recv_internal\n        5 => {')
  })
})

describe('library cells', () => {
  const tc: ToncenterClient = {
    v2: async <T>() => library.result as T,
    v3: async <T>() => ({ status: 'active', balance: '1', code: Buffer.from(walletInspect.code, 'hex').toString('base64'), data: null }) as T
  }

  it('finds the library hash in a USD₮ jetton wallet code and resolves it to code that hashes to it', async () => {
    const code = Cell.fromHex(walletInspect.code)
    const hashes = libraryHashes(code)
    expect(hashes).toEqual(['8f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68'])
    const [lib] = await fetchLibraries(tc, hashes)
    expect(lib!.hash().toString('hex')).toBe(hashes[0])
    const d = disassemble(tasm, effectiveCode(code, [lib!]), walletInspect.methods)
    expect(d.methods.map(m => m.name)).toEqual(expect.arrayContaining(['recv_internal', 'get_wallet_data', 'get_status']))
  })

  it('fetchAccountState returns code, libs and an empty data cell when data is null', async () => {
    const s = await fetchAccountState(tc, USDT_WALLET)
    expect(s.libs).toHaveLength(1)
    expect(s.data.bits.length).toBe(0)
  })

  it('rejects a library answer that does not hash to the requested hash', async () => {
    const bad: ToncenterClient = { ...tc, v2: async <T>() => ({ result: [{ hash: library.result.result[0]!.hash, data: Buffer.from(walletInspect.code, 'hex').toString('base64') }] }) as T }
    await expect(fetchLibraries(bad, ['8f452d7a4dfd74066b682365177259ed05734435be76b5fd4bd5d8af2b7c3d68'])).rejects.toThrow(/Not trusting/)
  })

  it('reports an undeployed account clearly', async () => {
    const none: ToncenterClient = { ...tc, v3: async <T>() => ({ status: 'uninit', balance: '0', code: null, data: null }) as T }
    await expect(fetchAccountState(none, USDT_WALLET)).rejects.toThrow(/not deployed/)
  })
})

describe('parseCodeSource', () => {
  it('accepts addresses and BOCs (base64 or hex), rejects junk', () => {
    expect(parseCodeSource('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs').kind).toBe('address')
    expect(parseCodeSource(master.code).kind).toBe('boc')
    expect(parseCodeSource(Buffer.from(master.code, 'hex').toString('base64')).kind).toBe('boc')
    expect(() => parseCodeSource('hello')).toThrow(/Not a TON address or a BOC/)
    expect(() => parseCodeSource(' ')).toThrow(/Paste/)
  })
})

describe('compareCode', () => {
  const pk = Buffer.alloc(32)
  const v4 = disassemble(tasm, WalletContractV4.create({ workchain: 0, publicKey: pk }).init.code)
  const v5 = disassemble(tasm, WalletContractV5R1.create({ workchain: 0, publicKey: pk }).init.code)

  it('wallet v4r2 → W5: plugins removed, extensions added, shared getters kept', () => {
    const c = compareCode(v4, v5)
    const by = (s: string) => c.methods.filter(m => m.status === s).map(m => m.name).sort()
    expect(c.identical).toBe(false)
    expect(by('added')).toEqual(['get_extensions', 'is_signature_allowed'])
    expect(by('removed')).toEqual(['get_plugin_list', 'is_plugin_installed'])
    for (const n of ['seqno', 'get_public_key', 'get_subwallet_id']) expect(c.methods.find(m => m.name === n)?.status).toMatch(/same|changed/)
    expect(c.methods.find(m => m.name === 'recv_external')?.status).toBe('changed')
  })

  it('identical code compares as identical', () => {
    expect(compareCode(v4, v4).identical).toBe(true)
  })
})

describe('diffLines', () => {
  it('keeps common lines and marks changes', () => {
    expect(diffLines('a\nb\nc\nd', 'a\nx\nc\nd\ne')).toEqual([
      { op: ' ', text: 'a' }, { op: '-', text: 'b' }, { op: '+', text: 'x' }, { op: ' ', text: 'c' }, { op: ' ', text: 'd' }, { op: '+', text: 'e' }
    ])
  })
  it('gives up (null) on inputs too big to diff', () => {
    expect(diffLines('a\nb\nc', 'x\ny\nz', 4)).toBeNull()
  })
})
