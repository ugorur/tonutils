import { describe, expect, it } from 'vitest'
import { toHex } from '~/lib/crypto/bytes'
import { crc32, digestMatches, formatDigest, hashAll, hmac, methodId, pbkdf2, tlbOp } from './logic'

const te = (s: string) => new TextEncoder().encode(s)
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map(b => Number.parseInt(b, 16)))

describe('hashAll', () => {
  it('matches FIPS 180-2 "abc" vectors', async () => {
    const h = await hashAll(te('abc'))
    expect(toHex(h.sha256)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(toHex(h.sha512)).toBe('ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f')
  })

  it('matches the CRC catalogue check values for "123456789"', async () => {
    // reveng CRC catalogue: CRC-16/XMODEM 0x31c3, CRC-32/ISO-HDLC 0xcbf43926, CRC-32/ISCSI 0xe3069283.
    const h = await hashAll(te('123456789'))
    expect(toHex(h.crc16)).toBe('31c3')
    expect(toHex(h.crc32)).toBe('cbf43926')
    expect(toHex(h.crc32c)).toBe('e3069283')
    expect(toHex(crc32(new Uint8Array()))).toBe('00000000')
  })

  it('hashes the empty input', async () => {
    const h = await hashAll(new Uint8Array())
    expect(toHex(h.sha256)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(toHex(h.crc16)).toBe('0000')
    expect(toHex(h.crc32c)).toBe('00000000')
  })

  it('CRC-32C of a real BOC equals its stored checksum (little-endian, last 4 bytes)', async () => {
    // te6cck... = BOC with crc32c flag: the v4R2 transfer body of mainnet tx ic5v6rptswpKyqaAAWAHbgYTCrMRZOvD7mJUFQJRb08= (toncenter /api/v3/transactions).
    const boc = Uint8Array.from(atob('te6cckEBAgEAogABnBD3pBjkMH78vDEEyRefSXgIxZVY136q872j2lEQQF4CiofJQHeJfyxl3YLAfLMMkCRIw+4h2LA/Hm95vuvTnAUpqaMXatkkfgAAA14AAwEAnkIAMSTIUU8hSyp59rCJMJqa9B1yYMdc2bMi4io529ubAJ4o+3UEMAAAAAAAAAAAAAAAAAAAAAAAAFQ2RVhzUk12cjNuWmpweDRRcGJ4NDFKpfgX'), c => c.charCodeAt(0))
    const h = await hashAll(boc.subarray(0, -4))
    expect(toHex(h.crc32c)).toBe(toHex(boc.slice(-4).reverse()))
  })

  it('crc32 of a TL-B scheme gives the TEP-74 op codes', () => {
    // TEP-74 "Jetton standard", op code derivations.
    const transfer = crc32(te('transfer query_id:uint64 amount:VarUInteger 16 destination:MsgAddress response_destination:MsgAddress custom_payload:Maybe ^Cell forward_ton_amount:VarUInteger 16 forward_payload:Either Cell ^Cell = InternalMsgBody'))
    expect(toHex(transfer)).toBe('8f8a7ea5')
    expect(tlbOp(transfer)).toBe(0x0F8A7EA5)
    expect(toHex(crc32(te('burn_notification query_id:uint64 amount:VarUInteger 16 sender:MsgAddress response_destination:MsgAddress = InternalMsgBody')))).toBe('7bdd97de')
    expect(tlbOp(crc32(te('transfer_notification query_id:uint64 amount:VarUInteger 16 sender:MsgAddress forward_payload:Either Cell ^Cell = InternalMsgBody')))).toBe(0x7362D09C)
  })
})

describe('methodId', () => {
  it('matches get-method ids a live wallet v4r2 exposes (toncenter /api/v3/accountStates contract_methods)', () => {
    expect(methodId('seqno')).toBe(85143)
    expect(methodId('get_public_key')).toBe(78748)
    expect(methodId('get_subwallet_id')).toBe(81467)
    expect(methodId('get_plugin_list')).toBe(107653)
    expect(methodId('is_plugin_installed')).toBe(76407)
  })
})

describe('formatDigest / digestMatches', () => {
  const d = hex('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  it('formats every way', () => {
    expect(formatDigest(d, 'base64')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=')
    expect(formatDigest(d, 'base64url')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
    expect(formatDigest(hex('31c3'), 'decimal')).toBe('12739')
  })
  it('matches an expected value in any format', () => {
    expect(digestMatches(d, 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')).toBe(true)
    expect(digestMatches(d, 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=')).toBe(true)
    expect(digestMatches(d, 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')).toBe(true)
    expect(digestMatches(hex('31c3'), '12739')).toBe(true)
    expect(digestMatches(d, 'ba7816bf')).toBe(false)
    expect(digestMatches(d, '')).toBe(false)
  })
})

describe('hmac', () => {
  it('accepts an empty key (Python hmac.new(b"", b"", ...))', async () => {
    expect(toHex(await hmac('SHA-256', new Uint8Array(), new Uint8Array()))).toBe('b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad')
    expect(toHex(await hmac('SHA-512', new Uint8Array(), new Uint8Array()))).toBe('b936cee86c9f87aa5d3c6f2e84cb5a4239a5fe50480a6ec66b70ab5b1f4ac6730c6c515421b327ec1d69402e53dfb49ad7381eb067b338fd7b0cb22247225d47')
  })
})

describe('hmac (RFC 4231 test case 2)', () => {
  it('SHA-256 and SHA-512', async () => {
    const key = te('Jefe')
    const data = te('what do ya want for nothing?')
    expect(toHex(await hmac('SHA-256', key, data))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
    expect(toHex(await hmac('SHA-512', key, data))).toBe('164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737')
  })
})

describe('pbkdf2', () => {
  // RFC 7914 section 11 (PBKDF2-HMAC-SHA256, P="passwd", S="salt", c=1, 64 bytes).
  it('matches RFC 7914 PBKDF2-HMAC-SHA256', async () => {
    expect(toHex(await pbkdf2('SHA-256', te('passwd'), te('salt'), 1, 64))).toBe('55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783')
  })
  // Python hashlib.pbkdf2_hmac('sha512', b'password', b'salt', n, 64) (OpenSSL).
  it('matches PBKDF2-HMAC-SHA512', async () => {
    expect(toHex(await pbkdf2('SHA-512', te('password'), te('salt'), 1, 64))).toBe('867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252c02d470a285a0501bad999bfe943c08f050235d7d68b1da55e63f73b60a57fce')
    expect(toHex(await pbkdf2('SHA-512', te('password'), te('salt'), 4096, 64))).toBe('d197b1b33db0143e018b12f3d1d1479e6cdebdcc97c5c0f87f6902e072f457b5143f30602641b3d55cd335988cb36b84376060ecd532e039b742a239434af2d5')
  })
  it('rejects bad parameters', async () => {
    await expect(pbkdf2('SHA-512', te('p'), te('s'), 0, 64)).rejects.toThrow(/Iterations/)
    await expect(pbkdf2('SHA-512', te('p'), te('s'), 1, 0)).rejects.toThrow(/Key length/)
  })
})
