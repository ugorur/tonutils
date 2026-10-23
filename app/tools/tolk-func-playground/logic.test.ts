import { Address, beginCell, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import * as counter from '~/lib/compilers/examples/counter'
import * as dogs from '~/lib/compilers/examples/dogs-minter'
import * as tolkWallet from '~/lib/compilers/examples/tolk-js-wallet'
import { decodeProject, encodeProject, freeName, funcIncludes, funcSources, normalizePath, tolkSources } from '~/lib/compilers/files'
import stdlib from '~/lib/compilers/stdlib.fc?raw'
import { funcHandlers } from '~/utils/lazy/func.worker'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import { tolkHandlers } from '~/utils/lazy/tolk.worker'
import { compiledJson, deployInfo, fromFunc, fromTolk, funcGetMethods, parseData, stackToJson } from './logic'

// The worker handler modules run unchanged in Node, so these compile with the same WASM the browser uses.

async function compileDogs(files = dogs.files) {
  const { sources, addedStdlib } = funcSources(files, stdlib)
  const r = await funcHandlers.compile(sources, [normalizePath(files[0]!.path)])
  return fromFunc(r, files, addedStdlib, 0)
}

describe('FunC: DOGS jetton minter (mainnet EQCvxJy4…_DOGS, sources from verifier.ton.org)', () => {
  it('reproduces the on-chain code hash with the verified sources', async () => {
    const out = await compileDogs()
    expect(out.ok, out.ok ? '' : out.message).toBe(true)
    if (!out.ok) return
    expect(out.codeHashHex).toBe(dogs.CODE_HASH)
    expect(out.addedStdlib).toEqual([])
    expect(out.fiftCode).toContain('PROGRAM{')
  }, 120_000)

  it('compiles when the user leaves out stdlib.fc (the bundled Blueprint stdlib is supplied at the include path)', async () => {
    const out = await compileDogs(dogs.files.filter(f => !f.path.endsWith('stdlib.fc')))
    expect(out.ok, out.ok ? '' : out.message).toBe(true)
    if (!out.ok) return
    expect(out.addedStdlib).toEqual(['contracts/stdlib.fc'])
    // Not the on-chain hash: Blueprint's stdlib has is_bounced() = `flags & 1 == 1`, DOGS shipped `flags & 1`.
    expect(out.codeHashHex).not.toBe(dogs.CODE_HASH)
  }, 120_000)

  it('finds the get methods and runs get_jetton_data on the real storage', async () => {
    const out = await compileDogs()
    if (!out.ok) throw new Error(out.message)
    const names = out.getMethods.map(m => `${m.name}/${m.params}`)
    expect(names).toEqual(expect.arrayContaining(['get_jetton_data/0', 'get_wallet_address/1']))

    const res = await sandboxHandlers.runGetMethod({
      code: out.codeBoc64,
      data: dogs.DATA_BOC,
      address: Address.parse(dogs.DOGS_MASTER).toRawString(),
      method: 'get_jetton_data'
    })
    expect(res.output.success).toBe(true)
    if (!res.output.success) return
    expect(res.output.vm_exit_code).toBe(0)
    const { parseTuple } = await import('@ton/core')
    const stack = stackToJson(parseTuple(Cell.fromBase64(res.output.stack)))
    expect(stack[0]).toBe(dogs.TOTAL_SUPPLY.toString())
    // admin_address is null on toncenter: addr_none is the 2-bit slice 00
    expect(stack[2]).toEqual({ slice: beginCell().storeUint(0, 2).endCell().toBoc().toString('base64') })
  }, 120_000)

  it('reports compile errors instead of throwing', async () => {
    const r = await funcHandlers.compile({ 'main.fc': '() recv_internal() impure { undefined_fn(); }' }, ['main.fc'])
    const out = fromFunc(r, [], [], 0)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.message).toContain('undefined_fn')
  }, 120_000)
})

describe('Tolk: wallet contract from the tolk-js 1.5.0 test suite', () => {
  it('compiles a multi-folder project to the hash tolk-js expects, with ABI get methods', async () => {
    const r = await tolkHandlers.compile(tolkSources(tolkWallet.files), normalizePath(tolkWallet.files[0]!.path))
    const out = fromTolk(r, 0)
    expect(out.ok, out.ok ? '' : out.message).toBe(true)
    if (!out.ok) return
    expect(out.codeHashB64).toBe(tolkWallet.CODE_HASH_BASE64)
    expect(out.getMethods.map(m => m.name)).toEqual(['seqno', 'get_public_key'])
    // TVM method id = (crc16(name) & 0xffff) | 0x10000; seqno is the well-known 85143
    expect(out.getMethods[0]!.id).toBe(85143)
  }, 120_000)

  it('drops the main() entrypoint (ABI method id 0) from get methods', async () => {
    const out = fromTolk(await tolkHandlers.compile({ 'main.tolk': 'fun main() { return; }\nget fun answer(): int { return 42; }' }, 'main.tolk'), 0)
    if (!out.ok) throw new Error(out.message)
    expect(out.getMethods).toEqual([{ name: 'answer', params: 0, id: 123639 }])
  }, 120_000)

  it('rejects a version pragma from another compiler version (tolk-js test)', async () => {
    const out = fromTolk(await tolkHandlers.compile({ 'main.tolk': 'tolk 0.1\nfun main() { return; }' }, 'main.tolk'), 0)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.message).toContain('the contract is written in Tolk v0.1, but you use Tolk compiler v1.5.0')
  }, 120_000)
})

describe('deploy address', () => {
  it('matches a real wallet v4r2 deploy (tx Q0l+GVAo… on mainnet, StateInit from toncenter v3)', () => {
    // Same StateInit as app/tools/contract-address-from-stateinit/examples.ts: code + data of the deployed wallet.
    const si = Cell.fromBase64('te6cckECFgEAAwQAAgE0AQIBFP8A9KQT9LzyyAsDAFEAAAAAKamjF6wiYFkc55zzJO5KwJY0diPte8ZRO9qzHirdpqU4AJxxQAIBIAQFAgFIBgcE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8SExQVAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNCAkCASAKCwB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAMDQBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDg8AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIBARABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVOJ6PEU=')
    const [code, data] = si.refs as [Cell, Cell]
    const d = deployInfo(code.toBoc().toString('base64'), data, 0, false)
    expect(d.raw).toBe('0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc')
    expect(Cell.fromBase64(d.stateInitBoc).hash().equals(si.hash())).toBe(true)
    expect(d.bounceable.startsWith('EQ')).toBe(true)
    expect(deployInfo(code.toBoc().toString('base64'), data, 0, true).nonBounceable.startsWith('0Q')).toBe(true)
  })

  it('parseData: empty input is an empty cell, hex and base64 BOCs both parse', () => {
    expect(parseData('').hash().equals(beginCell().endCell().hash())).toBe(true)
    const c = Cell.fromBase64(dogs.DATA_BOC)
    expect(parseData(c.toBoc().toString('hex')).hash().equals(c.hash())).toBe(true)
  })

  it('compiledJson uses blueprint field names', () => {
    const j = JSON.parse(compiledJson(Cell.fromBase64(dogs.DATA_BOC).toBoc().toString('base64')))
    expect(Object.keys(j)).toEqual(['hash', 'hashBase64', 'hex'])
  })
})

describe('project helpers', () => {
  it('resolves FunC includes relative to the including file', () => {
    expect(funcIncludes({ path: 'contracts/jetton-minter.fc', content: '#include "imports/stdlib.fc";\n  #include "../common/op.fc";' }))
      .toEqual(['contracts/imports/stdlib.fc', 'common/op.fc'])
    expect(normalizePath('./a/./b/../c.tolk')).toBe('a/c.tolk')
  })

  it('funcGetMethods skips comments and forward declarations', () => {
    const src = ';; int fake() method_id { }\nint seqno() method_id;\nint seqno() method_id {\n return 1; }\n(int, slice) get_x(slice owner) method_id(1234) {}\n{- int hidden() method_id {} -}'
    expect(funcGetMethods([{ path: 'a.fc', content: src }])).toEqual([{ name: 'seqno', params: 0 }, { name: 'get_x', params: 1, id: 1234 }])
  })

  it('freeName avoids clashes', () => {
    expect(freeName([{ path: 'main.tolk', content: '' }, { path: 'main-2.tolk', content: '' }], 'main.tolk')).toBe('main-3.tolk')
  })

  it('share links round-trip and reject junk', async () => {
    const p = { lang: 'func' as const, files: dogs.files }
    const hash = await encodeProject(p)
    expect(hash.length).toBeLessThan(40_000)
    expect(await decodeProject(`#${hash}`)).toEqual(p)
    const withData = { ...p, data: dogs.DATA_BOC }
    expect(await decodeProject(await encodeProject(withData))).toEqual(withData)
    expect(await decodeProject('#p=AAAA')).toBeNull()
    expect(await decodeProject('#x=1')).toBeNull()
  })
})

describe('FunC custom method_id', () => {
  it('runs a `method_id(777)` getter by its id, not by crc16 of its name', async () => {
    const files = [{ path: 'main.fc', content: '() recv_internal() impure { }\nint custom() method_id(777) { return 7; }' }]
    const out = fromFunc(await funcHandlers.compile({ 'main.fc': files[0]!.content }, ['main.fc']), files, [], 0)
    if (!out.ok) throw new Error(out.message)
    expect(out.getMethods).toEqual([{ name: 'custom', params: 0, id: 777 }])
    const call = (method: string | number) => sandboxHandlers.runGetMethod({ code: out.codeBoc64, data: beginCell().endCell().toBoc().toString('base64'), address: '0:' + '0'.repeat(64), method })
    const byId = await call(777)
    expect(byId.output.success && byId.output.vm_exit_code).toBe(0)
    // crc16('custom') | 0x10000 is not in this contract's method dictionary: TVM exit 11
    const byName = await call('custom')
    expect(byName.output.success && byName.output.vm_exit_code).toBe(11)
  }, 120_000)
})

describe('built-in counter examples', () => {
  const run = async (code: string, method: string) => {
    const res = await sandboxHandlers.runGetMethod({ code, data: counter.COUNTER_DATA, address: '0:' + '0'.repeat(64), method })
    if (!res.output.success) throw new Error(res.output.error)
    const { parseTuple } = await import('@ton/core')
    return { exit: res.output.vm_exit_code, stack: stackToJson(parseTuple(Cell.fromBase64(res.output.stack))) }
  }

  it('Tolk counter compiles and currentCounter() reads the initial 0', async () => {
    const out = fromTolk(await tolkHandlers.compile(tolkSources(counter.tolkFiles), counter.tolkFiles[0]!.path), 0)
    expect(out.ok, out.ok ? '' : out.message).toBe(true)
    if (!out.ok) return
    expect(out.getMethods.map(m => m.name)).toEqual(['currentCounter'])
    expect(await run(out.codeBoc64, 'currentCounter')).toEqual({ exit: 0, stack: ['0'] })
  }, 120_000)

  it('FunC counter compiles with the bundled stdlib and get_counter() reads the initial 0', async () => {
    const { sources, addedStdlib } = funcSources(counter.funcFiles, stdlib)
    const out = fromFunc(await funcHandlers.compile(sources, [counter.funcFiles[0]!.path]), counter.funcFiles, addedStdlib, 0)
    expect(out.ok, out.ok ? '' : out.message).toBe(true)
    if (!out.ok) return
    expect(out.addedStdlib).toEqual(['contracts/imports/stdlib.fc'])
    expect(out.getMethods).toEqual([{ name: 'get_counter', params: 0 }])
    expect(await run(out.codeBoc64, 'get_counter')).toEqual({ exit: 0, stack: ['0'] })
  }, 120_000)
})
