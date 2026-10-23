import { describe, expect, it } from 'vitest'
import { API_BASES, DOCS, EXPLORERS, FAUCETS, parseStatus, testnetForms } from './logic'

describe('testnetForms', () => {
  // Expected values from testnet toncenter /api/v3/addressBook (2026-10-23), which returns testnet user-friendly forms.
  it('mainnet EQ… → testnet 0Q… (testnet.toncenter.com addressBook for 0:83df…31a8)', () => {
    const f = testnetForms('EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N')
    expect(f.raw).toBe('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
    expect(f.nonBounceable).toBe('0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC')
    // mainnet non-bounceable from toncenter /api/v2/detectAddress
    expect(f.mainnetNonBounceable).toBe('UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI')
    expect(f.bounceable.startsWith('kQ')).toBe(true)
    expect(f.inputIsTestnet).toBe(false)
  })

  it('raw masterchain elector → testnet bounceable kf8z… (testnet addressBook for -1:3333…)', () => {
    const f = testnetForms('-1:3333333333333333333333333333333333333333333333333333333333333333')
    expect(f.bounceable).toBe('kf8zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM_BP')
    expect(f.inputIsRaw).toBe(true)
  })

  it('detects testnet input and rejects garbage', () => {
    expect(testnetForms('0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC').inputIsTestnet).toBe(true)
    expect(() => testnetForms('')).toThrow()
    expect(() => testnetForms('hello')).toThrow()
  })
})

describe('parseStatus', () => {
  // Trimmed response of GET https://testnet.toncenter.com/api/v3/masterchainInfo on 2026-10-23.
  const info = { last: { seqno: 93154827, global_id: -3, gen_utime: '1792764030' } }
  it('reads seqno, global_id -3 and block age', () => {
    expect(parseStatus(info, 1792764035)).toEqual({ seqno: 93154827, ageSec: 5, isTestnet: true, fresh: true })
    expect(parseStatus(info, 1792764030 + 120).fresh).toBe(false)
    expect(parseStatus({ last: { ...info.last, global_id: -239 } }, 1792764035).isTestnet).toBe(false)
  })
})

describe('links', () => {
  it('are https and unique', () => {
    const urls = [...FAUCETS, ...EXPLORERS, ...DOCS, ...API_BASES].map(l => l.url)
    expect(urls.every(u => u.startsWith('https://'))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
