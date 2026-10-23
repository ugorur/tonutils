// One public IPFS gateway for the whole site. Pure TS (auto-imported).
// ipfs.io / dweb.link answer embedded requests with 429 and a "switching to a service worker gateway" notice
// (gatewaychanges.ipfs.io, checked 2026-10-23); w3s.link and nftstorage.link redirect to them; cloudflare-ipfs.com
// shut down in 2024. gateway.pinata.cloud served unrelated CIDs as images on 2026-10-23.
export const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

export const DEAD_GATEWAY = /^https?:\/\/(?:ipfs\.io|dweb\.link|w3s\.link|nftstorage\.link|cloudflare-ipfs\.com)\/ipfs\//i

/** ipfs://CID/path (and links to dead gateways) → the shared gateway; ar:// → arweave.net; anything else unchanged. */
export function ipfsToHttp(uri: string): string {
  const u = uri.trim()
  if (/^ipfs:\/\//i.test(u)) return IPFS_GATEWAY + u.replace(/^ipfs:\/\/(ipfs\/)?/i, '')
  if (/^ar:\/\//i.test(u)) return `https://arweave.net/${u.slice(5)}`
  return u.replace(DEAD_GATEWAY, IPFS_GATEWAY)
}
