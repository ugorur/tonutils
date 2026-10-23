import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OPCODES } from '~/utils/ton/opcodes'
import { TEPS, searchTeps } from './logic'

// Expected rows are copied from the "Merged TEPs" table of github.com/ton-blockchain/TEPs README (2026-10-23);
// op codes and getters from the TEP texts (text/0062, 0066, 0074, 0089, 0122, 0126, 0526).

const tep = (n: number) => TEPS.find(t => t.num === n)!

describe('TEP index', () => {
  it('lists every merged TEP from the README', () => {
    const readme = [1, 2, 3, 62, 64, 66, 74, 81, 85, 89, 91, 115, 122, 126, 160, 467, 526]
    expect(TEPS.filter(t => t.status === 'Active' || t.status === 'Implemented').map(t => t.num)).toEqual(readme)
  })

  it.each([
    [2, 'TON Addresses', 'Core', '07.09.2019'],
    [74, 'Fungible tokens (Jettons) standard', 'Contract Interface', '12.03.2022'],
    [115, 'TON Connect', 'Core', '20.10.2022'],
    [467, 'Normalized Message Hash', 'Core', '03.04.2025'],
    [526, 'Scaled UI Jettons', 'Contract Interface', '19.09.2025']
  ])('TEP-%i matches the README row', (n, title, type, created) => {
    expect(tep(n)).toMatchObject({ title, type, created })
  })

  it('TEP-160 is "Implemented" in its header', () => {
    expect(tep(160).status).toBe('Implemented')
  })

  it('getters match the TEP text', () => {
    expect(tep(74).getters).toContain('get_wallet_data() → (int balance, slice owner, slice jetton, cell jetton_wallet_code)')
    expect(tep(66).getters).toEqual(['royalty_params() → (int numerator, int denominator, slice destination)'])
    expect(tep(526).getters).toEqual(['get_display_multiplier() → (int numerator, int denominator)'])
  })

  it('op codes in TEPs 62/66/74/81/85/89 agree with the shared op code table', () => {
    const known = new Set(OPCODES.map(o => o.op >>> 0))
    for (const n of [62, 66, 74, 81, 85, 89]) {
      for (const op of tep(n).ops ?? []) {
        const hex = /#([0-9a-f]{8})/.exec(op)![1]!
        expect(known.has(Number.parseInt(hex, 16)), `TEP-${n} ${op}`).toBe(true)
      }
    }
  })

  it('links point to the TEPs repo', () => {
    for (const t of TEPS) expect(t.url).toMatch(/^https:\/\/github\.com\/ton-blockchain\/TEPs\/(blob\/master\/text\/\d{4}-[a-z0-9-]+\.md|pull\/\d+)$/)
  })

  it('related tools exist in the repo', () => {
    const toolsDir = fileURLToPath(new URL('..', import.meta.url))
    for (const t of TEPS) for (const slug of t.tools ?? []) expect(existsSync(`${toolsDir}/${slug}`), slug).toBe(true)
  })
})

describe('searchTeps', () => {
  it('finds by number in several spellings', () => {
    for (const q of ['74', 'TEP-74', 'tep74', 'tep 74']) expect(searchTeps(q).map(t => t.num)).toEqual([74])
  })

  it('finds by op code, getter and keyword', () => {
    expect(searchTeps('0x0f8a7ea5').map(t => t.num)).toEqual([74])
    expect(searchTeps('dnsresolve').map(t => t.num)).toEqual([81])
    expect(searchTeps('mintless').map(t => t.num)).toEqual([176, 177])
  })

  it('merged filter hides proposals', () => {
    expect(searchTeps('', { merged: true }).every(t => t.status === 'Active' || t.status === 'Implemented')).toBe(true)
  })
})
