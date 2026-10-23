import { describe, expect, it } from 'vitest'
import { ipfsToHttp } from './ipfs'

describe('ipfsToHttp', () => {
  it('maps ipfs://, ipfs://ipfs/ and dead gateways to the shared gateway', () => {
    expect(ipfsToHttp('ipfs://bafyabc/meta.json')).toBe('https://gateway.pinata.cloud/ipfs/bafyabc/meta.json')
    expect(ipfsToHttp('ipfs://ipfs/Qm1/x')).toBe('https://gateway.pinata.cloud/ipfs/Qm1/x')
    expect(ipfsToHttp('https://ipfs.io/ipfs/Qm1/x.png')).toBe('https://gateway.pinata.cloud/ipfs/Qm1/x.png')
    expect(ipfsToHttp('ar://abc')).toBe('https://arweave.net/abc')
    expect(ipfsToHttp('https://x.y/a')).toBe('https://x.y/a')
  })
})
