import { describe, expect, it } from 'vitest'
import { convertAdnl } from './logic'

// foundation.ton site record: toncenter /api/v3/dns/records?domain=foundation.ton returns
// dns_site_adnl "UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ=" (read 2026-10-22). The hex and
// .adnl forms were computed independently with Python stdlib (base64.b32encode + binascii.crc_hqx).
const FOUNDATION = {
  base64: 'UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ=',
  hex: '516618cf6cbe9004f6883e742c9a2e3ca53ed02e3e36f4cef62a98ee1e449174',
  friendly: 'viwmggpns7jabhwra7hile2fy6kkpwqfy7dn5go6yvjr3q6isixjwkf'
}
// TON documentation TON Sites example host; its CRC16 checks out (verified with Python stdlib).
const DOCS = {
  friendly: 'utoljjye6y4ixazesjofidlkrhyiakiwrmes3m5hthlc6ie2h72gllt',
  hex: '26e5a53827b1c45c192492e2a06b544f840148b458496d9d3cceb17904d1ffa3'
}
// 32 × 0xab, vector from the catalog spec (also reproduced with Python stdlib).
const AB = { hex: 'ab'.repeat(32), friendly: 'wv2xk5lvov2xk5lvov2xk5lvov2xk5lvov2xk5lvov2xk5lvov2wb3c' }

describe('convertAdnl', () => {
  it('converts the on-chain base64 record to hex and .adnl', () => {
    expect(convertAdnl(FOUNDATION.base64)).toEqual({ ...FOUNDATION, siteUrl: `http://${FOUNDATION.friendly}.adnl/`, input: 'base64' })
  })

  it.each([FOUNDATION, DOCS, AB])('round-trips $hex', (v) => {
    expect(convertAdnl(v.hex).friendly).toBe(v.friendly)
    expect(convertAdnl(v.friendly).hex).toBe(v.hex)
    expect(convertAdnl(v.hex.toUpperCase()).input).toBe('hex')
  })

  it('accepts a TON Site URL, a bare host, upper case and base64url', () => {
    expect(convertAdnl(`http://${DOCS.friendly}.adnl/index.html`).hex).toBe(DOCS.hex)
    expect(convertAdnl(`${DOCS.friendly}.adnl`).hex).toBe(DOCS.hex)
    expect(convertAdnl(DOCS.friendly.toUpperCase()).hex).toBe(DOCS.hex)
    expect(convertAdnl('UWYYz2y-kAT2iD50LJouPKU-0C4-NvTO9iqY7h5EkXQ').hex).toBe(FOUNDATION.hex)
  })

  it.each([
    ['', /Enter/],
    ['hello', /Not an ADNL/],
    ['ab'.repeat(31), /Not an ADNL/],
    [DOCS.friendly.slice(0, -1) + 'a', /checksum/]
  ])('rejects %j', (input, msg) => {
    expect(() => convertAdnl(input)).toThrow(msg)
  })
})
