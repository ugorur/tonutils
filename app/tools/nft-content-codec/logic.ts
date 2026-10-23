// NFT content codec: build and decode TEP-64 content, collection content and TEP-66 royalty cells,
// and read them from chain through get-methods. Cell codecs live in ~/lib/nfts-write/content.
import { ipfsToHttp } from '~/utils/ipfs'
import type { Cell } from '@ton/core'
import { type DecodedContent, onchainContent, offchainContent } from '~/lib/nfts-write/content'

export * from '~/lib/nfts-write/content'
export * from '~/lib/nfts-write/stack'

// ---------------------------------------------------------------- URLs

/** Browser-openable link for ipfs:// and ar:// URLs (other schemes unchanged). */
export const gatewayUrl = ipfsToHttp

export const isLink = (s: string) => /^(https?|ipfs|ar):\/\//i.test(s.trim())

// ---------------------------------------------------------------- builder form

export interface OnchainForm { name: string, description: string, image: string, cover_image: string, symbol: string }

/** Content cell from the builder form: an off-chain URL or on-chain fields. */
export function buildContent(kind: 'offchain' | 'onchain', uri: string, fields: Partial<OnchainForm>): Cell {
  if (kind === 'offchain') {
    if (!uri.trim()) throw new Error('Enter the metadata JSON URL')
    return offchainContent(uri)
  }
  const f = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && v.trim())) as Record<string, string>
  if (!Object.keys(f).length) throw new Error('Fill in at least one field')
  return onchainContent(f)
}

/** Readable label/value pairs of decoded content. */
export function contentRows(c: DecodedContent): { label: string, value: string }[] {
  if (c.kind === 'offchain') return [{ label: 'Off-chain URL', value: c.uri }]
  return c.fields.map(f => ({ label: f.key ?? `sha256 ${f.keyHash.slice(0, 12)}…`, value: f.text ?? `0x${f.hex}` }))
}

