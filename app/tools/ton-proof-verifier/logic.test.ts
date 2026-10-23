import { Address } from '@ton/core'
import { keyPairFromSeed } from '@ton/crypto'
import { describe, expect, it } from 'vitest'
import { EXAMPLE_PROOF, parseProofInput, proofChecks, proofSteps, resolvePublicKey, verifyProof } from './logic'

// Vector 1: real wallet proof from xssnick/tonutils-go ton/wallet/proof_test.go (v4R2 StateInit attached).
const REAL = parseProofInput(JSON.stringify(EXAMPLE_PROOF))

// Vector 2: okx/go-wallet-sdk coins/ton/connect_test.go TestSignProof: seed, address, proof fields and the
// expected base64 signature. The key pair comes from @ton/crypto (independent of our code).
const OKX_KEY = keyPairFromSeed(Buffer.from('fc81e6f42150458f53d8c42551a8ab91978a55d0e22b1fd890b85139086b93f8', 'hex')).publicKey.toString('hex')
const OKX = {
  address: 'EQA3_JIJKDC0qauDUEQe2KjQj1iLwQRtrEREzmfDxbCKw9Kr',
  proof: { timestamp: 1719309177, domain: { lengthBytes: 11, value: 'ton.org.com' }, payload: '123', signature: 'tkrepSlC/7RMdGmtqNQ/OKRkxtdzvwF6GYBP6sgKWI/9mP0KcqyUwpFHAEGF6xeNOrwwoxIce8KJuEHLxuIgDw==' }
}
const noChain = async () => null

describe('ton_proof verification', () => {
  it('verifies the real wallet proof with the key from its StateInit', async () => {
    const k = await resolvePublicKey(REAL, noChain)
    expect(k.source).toBe('stateinit')
    expect(k.detail).toMatch(/v4/i)
    expect(verifyProof(REAL, k.publicKey)).toBe(true)
  })

  it('verifies the okx SDK vector', () => {
    expect(verifyProof(OKX, OKX_KEY)).toBe(true)
  })

  it('rejects any change to the signed fields', async () => {
    const { publicKey } = await resolvePublicKey(REAL, noChain)
    const p = REAL.proof
    expect(verifyProof({ ...REAL, proof: { ...p, timestamp: p.timestamp + 1 } }, publicKey)).toBe(false)
    expect(verifyProof({ ...REAL, proof: { ...p, payload: '1747303885:x' } }, publicKey)).toBe(false)
    expect(verifyProof({ ...REAL, proof: { ...p, domain: { value: 'ton-connect.github.com', lengthBytes: 22 } } }, publicKey)).toBe(false)
    expect(verifyProof({ ...REAL, address: '-1:960ab627408d5472d9d125b667cbe00ce17eeaa44e9dc6a86e93cdfef2c480d5' }, publicKey)).toBe(false)
    expect(verifyProof({ ...REAL, proof: { ...p, signature: 'AAAA' } }, publicKey)).toBe(false)
    expect(verifyProof(OKX, publicKey)).toBe(false)
  })

  it('lays out the message as the spec says', () => {
    const s = proofSteps(OKX)
    const a = Address.parse(OKX.address)
    expect(s.message).toBe(Buffer.concat([
      Buffer.from('ton-proof-item-v2/'),
      Buffer.from('00000000', 'hex'), // workchain 0, int32 BE
      a.hash,
      Buffer.from('0b000000', 'hex'), // 11, uint32 LE
      Buffer.from('ton.org.com'),
      Buffer.from('79937a6600000000', 'hex'), // 1719309177 = 0x667a9379, uint64 LE
      Buffer.from('123')
    ]).toString('hex'))
    expect(s.preimage.startsWith(`ffff${Buffer.from('ton-connect').toString('hex')}${s.messageHash}`)).toBe(true)
  })
})

describe('parseProofInput', () => {
  it('accepts the @tonconnect/ui wallet object and a raw ConnectEvent', () => {
    const ui = parseProofInput(JSON.stringify({
      account: { address: EXAMPLE_PROOF.address, chain: '-239', walletStateInit: EXAMPLE_PROOF.proof.state_init, publicKey: 'AB'.repeat(32) },
      connectItems: { tonProof: { name: 'ton_proof', proof: { ...EXAMPLE_PROOF.proof, timestamp: String(EXAMPLE_PROOF.proof.timestamp) } } }
    }))
    expect(ui.network).toBe('-239')
    expect(ui.publicKey).toBe('ab'.repeat(32))
    expect(ui.proof.timestamp).toBe(1747303893)
    expect(ui.walletStateInit).toBe(EXAMPLE_PROOF.proof.state_init)

    const ev = parseProofInput(JSON.stringify({ event: 'connect', id: 1, payload: { items: [
      { name: 'ton_addr', address: OKX.address, network: '-3', publicKey: OKX_KEY, walletStateInit: '' },
      { name: 'ton_proof', proof: OKX.proof }
    ] } }))
    expect(ev.network).toBe('-3')
    expect(verifyProof(ev, ev.publicKey!)).toBe(true)
  })
  it('explains bad input', () => {
    expect(() => parseProofInput('{')).toThrow(/JSON/)
    expect(() => parseProofInput('{"address":"x"}')).toThrow(/No ton_proof/)
    expect(() => parseProofInput(JSON.stringify({ connectItems: { tonProof: { name: 'ton_proof', error: { code: 400, message: 'Method not supported' } } } }))).toThrow(/Method not supported/)
  })
})

describe('key resolution and checks', () => {
  it('falls back to the chain, then to the reported key with a warning', async () => {
    const onChain = await resolvePublicKey({ address: OKX.address }, async () => OKX_KEY.toUpperCase())
    expect(onChain).toMatchObject({ source: 'chain', publicKey: OKX_KEY })
    const reported = await resolvePublicKey({ address: OKX.address, publicKey: OKX_KEY }, noChain)
    expect(reported.source).toBe('provided')
    expect(reported.warning).toBeTruthy()
    await expect(resolvePublicKey({ address: OKX.address }, noChain)).rejects.toThrow(/Cannot find/)
  })
  it('flags a reported key that does not control the address', async () => {
    const k = await resolvePublicKey({ ...REAL, publicKey: OKX_KEY }, noChain)
    expect(k.mismatch).toMatch(/not the key/)
  })
  it('rejects a StateInit that belongs to another address', async () => {
    await expect(resolvePublicKey({ address: OKX.address, walletStateInit: REAL.walletStateInit }, noChain)).rejects.toThrow(/another account/)
  })
  it('checks domain, freshness and payload', () => {
    const at = (now: number, extra = {}) => proofChecks(REAL, { now, ...extra })
    const byLabel = (c: ReturnType<typeof at>, l: string) => c.find(x => x.label === l)!.state
    expect(byLabel(at(1747303893 + 30), 'Freshness')).toBe('pass')
    expect(byLabel(at(1747303893 + 3600), 'Freshness')).toBe('warn')
    expect(byLabel(at(1747303893 - 600), 'Freshness')).toBe('fail')
    expect(byLabel(at(0, { expectedDomain: 'ton-connect.github.io' }), 'Domain is yours')).toBe('pass')
    expect(byLabel(at(0, { expectedDomain: 'Ton-connect.github.io' }), 'Domain is yours')).toBe('fail')
    expect(byLabel(at(0, { expectedPayload: '1747303885:' }), 'Payload')).toBe('pass')
    expect(byLabel(at(0, { expectedPayload: 'other' }), 'Payload')).toBe('fail')
    expect(byLabel(proofChecks({ ...REAL, proof: { ...REAL.proof, domain: { value: 'tonkeeper', lengthBytes: 9 } } }), 'Domain format')).toBe('fail')
    expect(byLabel(proofChecks({ ...REAL, proof: { ...REAL.proof, domain: { value: 'a.io', lengthBytes: 5 } } }), 'Domain length')).toBe('fail')
  })
})
