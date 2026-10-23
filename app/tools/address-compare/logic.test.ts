import { describe, expect, it } from 'vitest'
import { compareAddresses, lookalikeRisk } from './logic'

// Forms from toncenter /api/v2/detectAddress (read 2026-10-22) and AddressAnatomy's verified testnet forms.
const F = {
  raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8',
  b: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
  n: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI',
  tn: '0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC'
}
const USDT = { b: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', n: 'UQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_p0p' }
const TOLYA = { b: 'EQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3Fy9', n: 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4' }
// Look-alike of F found by brute force over random hashes (first and last 4 characters of the UQ form match);
// toncenter detectAddress confirms it is a valid address with these EQ/UQ forms (read 2026-10-23).
const FAKE = {
  raw: '0:8374786e6a862bf185aade1cd5ef73d1b2230c49f8a770e4c2c7121e94e91aa8',
  b: 'EQCDdHhuaoYr8YWq3hzV73PRsiMMSfincOTCxxIelOkaqB2N',
  n: 'UQCDdHhuaoYr8YWq3hzV73PRsiMMSfincOTCxxIelOkaqEBI'
}

describe('compareAddresses', () => {
  it('treats every spelling of one account as the same', () => {
    for (const other of [F.b, F.raw, F.tn, ` ${F.n}\n`]) {
      const r = compareAddresses(F.n, other)
      expect(r.same).toBe(true)
      expect(r.risk).toBe('none')
      expect(r.differing).toBe(0)
      expect(r.shownB).toBe(F.n)
    }
  })

  it('explains flag differences on the same account', () => {
    expect(compareAddresses(F.n, F.b).flagNotes).toEqual([expect.stringMatching(/bounceable/)])
    expect(compareAddresses(F.b, F.raw).flagNotes).toEqual([expect.stringMatching(/raw form/)])
    expect(compareAddresses(F.n, F.tn).flagNotes).toEqual([expect.stringMatching(/testnet/)])
  })

  it('shows B in A\'s form and marks differing characters', () => {
    const r = compareAddresses(F.n, USDT.b)
    expect(r.same).toBe(false)
    expect(r.shownB).toBe(USDT.n)
    expect(r.diffA.map(d => d.char).join('')).toBe(F.n)
    expect(r.diffA.slice(0, 2).every(d => d.same)).toBe(true) // both start with UQ
    expect(r.differing).toBe([...F.n].filter((c, i) => c !== USDT.n[i]).length)
  })

  it('measures the visible prefix (flags included) and the suffix', () => {
    // UQCD39… vs UQCdqX…: "UQC" matches; endings "qEBI"/"3AF4" and "qB2N"/"3Fy9" share nothing.
    const r = compareAddresses(F.n, TOLYA.n)
    expect(r).toMatchObject({ same: false, prefix: 3, suffix: 0, risk: 'none' })
    expect(compareAddresses(F.raw, USDT.b).shownB).toBe('0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe')
  })

  it('flags a 4 + 4 look-alike as poisoning, whatever form each side is written in', () => {
    for (const [x, y] of [[F.n, FAKE.n], [F.b, FAKE.b], [F.raw, FAKE.n], [FAKE.raw, F.b]] as const) {
      expect(compareAddresses(x, y)).toMatchObject({ same: false, prefix: 4, suffix: 4, risk: 'lookalike' })
    }
  })

  it.each([
    ['', F.n, /Enter address A/],
    [F.n, 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDX', /Address B is not a valid/],
    [`300:${F.raw.slice(2)}`, F.n, /workchain 300/]
  ])('rejects bad input', (a, b, msg) => {
    expect(() => compareAddresses(a, b)).toThrow(msg)
  })
})

describe('lookalikeRisk', () => {
  it.each([
    [4, 4, 'lookalike'],
    [8, 5, 'lookalike'],
    [3, 4, 'similar'],
    [4, 2, 'similar'],
    [6, 0, 'similar'],
    [4, 1, 'none'],
    [2, 3, 'none'],
    [0, 0, 'none']
  ] as const)('prefix %i + suffix %i → %s', (p, s, risk) => {
    expect(lookalikeRisk(p, s)).toBe(risk)
  })
})
