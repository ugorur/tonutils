import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { Address, Cell, ReserveMode, SendMode, TupleReader, beginCell, comment, parseTuple } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { funcHandlers } from '~/utils/lazy/func.worker'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import { tolkHandlers } from '~/utils/lazy/tolk.worker'
import { RESERVE_MODES, SEND_MODES, TOPICS, filterTopics } from './logic'

// Independent checks:
// - every Tolk example compiles with the real Tolk 1.5 compiler (@ton/tolk-js), every FunC example with func-js 0.4.6;
// - send/reserve mode numbers match @ton/core's enums and the constants in Tolk's own stdlib (common.tolk).

// Declarations copied verbatim from FunC stdlib.fc (ton-blockchain/ton, crypto/smartcont/stdlib.fc).
const FUNC_STDLIB = `
forall X, Y -> X pair_first([X, Y] p) asm "FIRST";
int now() asm "NOW";
slice my_address() asm "MYADDR";
[int, cell] get_balance() asm "BALANCE";
int cell_hash(cell c) asm "HASHCU";
int check_signature(int hash, slice signature, int public_key) asm "CHKSIGNU";
cell get_data() asm "c4 PUSH";
() set_data(cell c) impure asm "c4 POP";
() accept_message() impure asm "ACCEPT";
slice begin_parse(cell c) asm "CTOS";
(slice, int) load_coins(slice s) asm( -> 1 0) "LDGRAMS";
builder begin_cell() asm "NEWC";
cell end_cell(builder b) asm "ENDC";
builder store_slice(builder b, slice s) asm "STSLICER";
builder store_coins(builder b, int x) asm "STGRAMS";
(slice, slice) load_msg_addr(slice s) asm( -> 1 0) "LDMSGADDR";
() send_raw_message(cell msg, int mode) impure asm "SENDRAWMSG";
int slice_empty?(slice s) asm "SEMPTY";
int equal_slice_bits (slice a, slice b) asm "SDEQ";
`

const examples = (lang: 'tolk' | 'func') => TOPICS.filter(t => t.example?.[lang]).map(t => [t.id, t.example![lang]!] as const)

describe('Tolk examples compile (Tolk 1.5)', () => {
  it.each(examples('tolk'))('%s', async (_id, src) => {
    const full = src.includes('fun onInternalMessage') ? src : `${src}\n\nfun onInternalMessage(in: InMessage) {}\n`
    const r = await tolkHandlers.compile({ 'main.tolk': full }, 'main.tolk')
    expect(r.status, r.status === 'error' ? r.message : '').toBe('ok')
  }, 60_000)
})

describe('FunC examples compile (func-js)', () => {
  it.each(examples('func'))('%s', async (_id, src) => {
    let full = src.includes('#include') ? src : `#include "imports/stdlib.fc";\n\n${src}`
    if (!full.includes('recv_internal')) full += '\n\n() recv_internal() impure { }\n'
    const r = await funcHandlers.compile({ 'imports/stdlib.fc': FUNC_STDLIB, 'main.fc': full }, ['main.fc'])
    expect(r.status, r.status === 'error' ? r.message : '').toBe('ok')
  }, 60_000)
})

describe('Tolk TextComment struct is a standard text comment', () => {
  it('serializes like @ton/core comment("thanks")', async () => {
    const send = TOPICS.find(t => t.id === 'send')!.example!.tolk!
    const struct = send.slice(0, send.indexOf('}') + 1)
    const src = `${struct}\n\nfun onInternalMessage(in: InMessage) {}\n\nget fun body(): cell {\n    val c: TextComment = { text: "thanks".literalSlice() };\n    return c.toCell();\n}\n`
    const r = await tolkHandlers.compile({ 'main.tolk': src }, 'main.tolk')
    expect(r.status, r.status === 'error' ? r.message : '').toBe('ok')
    if (r.status !== 'ok') return
    const res = await sandboxHandlers.runGetMethod({ code: r.codeBoc64, data: beginCell().endCell().toBoc().toString('base64'), address: Address.parse('0:' + '11'.repeat(32)).toRawString(), method: 'body' })
    if (!res.output.success) throw new Error(res.output.error)
    const cell = new TupleReader(parseTuple(Cell.fromBase64(res.output.stack))).readCell()
    expect(cell.equals(comment('thanks'))).toBe(true)
  }, 120_000)
})

describe('mode tables', () => {
  const tolkStdlib = readFileSync(join(dirname(createRequire(import.meta.url).resolve('@ton/tolk-js')), 'tolk-stdlib/common.tolk'), 'utf8')
  const tolkConst = (name: string) => {
    const m = new RegExp(`const ${name} = (\\d+)`).exec(tolkStdlib)
    return m ? Number(m[1]) : undefined
  }

  it('send modes match @ton/core SendMode and Tolk constants', () => {
    for (const m of SEND_MODES) {
      if (m.core) expect(SendMode[m.core as keyof typeof SendMode], m.core).toBe(m.value)
      expect(tolkConst(m.tolk), m.tolk).toBe(m.value)
    }
  })

  it('reserve modes match @ton/core ReserveMode and Tolk constants', () => {
    for (const m of RESERVE_MODES) {
      if (m.core) expect(ReserveMode[m.core as keyof typeof ReserveMode], m.core).toBe(m.value)
      expect(tolkConst(m.tolk), m.tolk).toBe(m.value)
    }
  })
})

describe('filterTopics', () => {
  it('filters by any snippet text', () => {
    expect(filterTopics('createMessage').map(t => t.id)).toEqual(['send'])
    expect(filterTopics('').length).toBe(TOPICS.length)
    expect(filterTopics('zzzz')).toEqual([])
  })
})
