import { describe, expect, it } from 'vitest'
import { convertBatch, convertedList, csvRows } from './logic'

// Vectors from toncenter /api/v2/detectAddress (mainnet and testnet forms), read 2026-10-22.
const FOUNDATION = {
  raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8',
  b: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N',
  n: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI',
  tb: 'kQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqKYH',
  tn: '0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC'
}
const USDT = {
  raw: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe',
  b: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
  bStd: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id/sDs',
  n: 'UQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_p0p'
}
const TOLYA = {
  raw: '0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc',
  b: 'EQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3Fy9',
  n: 'UQCdqXGvONLwOr3zCNX5FjapflorB6ZsOdcdfLrjsDLt3AF4'
}
const MASTER = { raw: '-1:3333333333333333333333333333333333333333333333333333333333333333', b: 'Ef8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM0vF' }

describe('convertBatch', () => {
  it('converts every line to all forms', () => {
    const r = convertBatch([FOUNDATION.b, USDT.raw, TOLYA.n].join('\n'))
    expect(r.valid).toBe(3)
    expect(r.rows[0]).toMatchObject({ status: 'ok', raw: FOUNDATION.raw, nonBounceable: FOUNDATION.n, bounceable: FOUNDATION.b, testnetBounceable: FOUNDATION.tb, testnetNonBounceable: FOUNDATION.tn })
    expect(r.rows[1]).toMatchObject({ raw: USDT.raw, bounceable: USDT.b, nonBounceable: USDT.n })
    expect(r.rows[2]).toMatchObject({ raw: TOLYA.raw, bounceable: TOLYA.b, workchain: 0 })
  })

  it('reads CSV rows, skips a header and blank lines, keeps line numbers', () => {
    const r = convertBatch(`address,amount\n\n"${USDT.bStd}",10\nhello,1\n${TOLYA.raw};5\t`)
    expect(r.rows.map(x => [x.line, x.status])).toEqual([[3, 'ok'], [4, 'invalid'], [5, 'ok']])
    expect(r.rows[1]!.note).toBe('No TON address found')
    expect(r.rows[0]!.token).toBe(USDT.bStd)
    expect(r.rows[0]!.nonBounceable).toBe(USDT.n)
  })

  it('flags duplicates across forms (same account, different spelling)', () => {
    const r = convertBatch([FOUNDATION.n, FOUNDATION.raw, FOUNDATION.tb, USDT.b].join('\n'))
    expect(r.valid).toBe(2)
    expect(r.duplicates).toBe(2)
    expect(r.rows[1]).toMatchObject({ status: 'duplicate', note: 'Same account as line 1' })
    expect(r.rows[2]).toMatchObject({ status: 'duplicate', testOnly: true })
    expect(convertedList(r.rows, 'raw')).toBe(`${FOUNDATION.raw}\n${USDT.raw}`)
  })

  it('flags broken checksums and counts masterchain / testnet-only rows', () => {
    const typo = USDT.b.slice(0, -1) + 'X'
    const r = convertBatch([typo, MASTER.b, FOUNDATION.tn].join('\n'))
    expect(r.rows[0]).toMatchObject({ status: 'invalid', note: 'Checksum or format error', token: typo })
    expect(r.rows[1]).toMatchObject({ raw: MASTER.raw, workchain: -1 })
    expect(r).toMatchObject({ valid: 2, invalid: 1, masterchain: 1, testOnly: 1 })
  })

  it('exports CSV rows with every form', () => {
    const [row] = csvRows(convertBatch(FOUNDATION.raw).rows)
    expect(row).toEqual({ line: 1, input: FOUNDATION.raw, status: 'ok', note: '', raw: FOUNDATION.raw, non_bounceable: FOUNDATION.n, bounceable: FOUNDATION.b, testnet_non_bounceable: FOUNDATION.tn, testnet_bounceable: FOUNDATION.tb })
  })

  it('reports a truncated first address or a link instead of skipping it as a header', () => {
    const r = convertBatch([FOUNDATION.n.slice(0, 12), `https://tonviewer.com/${USDT.b}`, FOUNDATION.b].join('\n'))
    expect(r.rows.map(x => [x.line, x.status])).toEqual([[1, 'invalid'], [2, 'invalid'], [3, 'ok']])
  })

  it('rejects workchains other than 0 and -1', () => {
    // 300 does not fit the 8-bit workchain field; 1 is a valid int8 but no such workchain exists.
    const r = convertBatch([`300:${FOUNDATION.raw.slice(2)}`, `1:${FOUNDATION.raw.slice(2)}`].join('\n'))
    expect(r.rows.map(x => x.status)).toEqual(['invalid', 'invalid'])
  })

  it('handles empty input and rejects huge input', () => {
    expect(convertBatch(' \n ').rows).toEqual([])
    expect(() => convertBatch('\n'.repeat(20001))).toThrow(/Too many lines/)
  })
})
