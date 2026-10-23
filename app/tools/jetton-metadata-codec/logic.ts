// TEP-64 content codec. The codec itself lives in ~/lib/jettons-dev/metadata (shared with metadata-validator).
import type { Cell } from '@ton/core'
import type { Layout, ValueFormat } from '~/lib/jettons-dev/metadata'
import { decodeContent, encodeOffchain, encodeOnchain, parseMetadataJson } from '~/lib/jettons-dev/metadata'

export { decodeContent, KNOWN_KEYS } from '~/lib/jettons-dev/metadata'
export type { DecodedContent, Layout, ValueFormat } from '~/lib/jettons-dev/metadata'

export const LAYOUT_INFO: Record<Layout, { label: string, detail: string }> = {
  onchain: { label: 'On-chain', detail: 'Every field is stored in the contract (0x00 + dictionary). No external file to lose.' },
  semichain: { label: 'Semi-chain', detail: 'On-chain dictionary with a uri key: wallets read the JSON at the URI and the on-chain keys override it.' },
  offchain: { label: 'Off-chain', detail: 'The contract stores only a URI (0x01 + link) to a JSON file.' }
}

export interface EncodeInput {
  layout: Layout
  /** Metadata JSON text (on-chain / semi-chain). */
  json: string
  /** Off-chain / semi-chain URI. */
  uri: string
  format: ValueFormat
}

/** Builds the content cell; returns the cell and non-fatal warnings. Throws Error with a readable message. */
export function encodeContent(input: EncodeInput): { cell: Cell, warnings: string[] } {
  if (input.layout === 'offchain') {
    const uri = input.uri.trim()
    if (!uri) throw new Error('Enter the URI of your metadata JSON')
    return { cell: encodeOffchain(uri), warnings: /^(https|ipfs):\/\//i.test(uri) ? [] : ['Use an https:// or ipfs:// URI: wallets may not load anything else'] }
  }
  const { fields, warnings } = parseMetadataJson(input.json || '{}')
  if (input.layout === 'semichain') {
    const uri = input.uri.trim() || fields.uri
    if (!uri) throw new Error('Semi-chain metadata needs a URI')
    fields.uri = uri
  }
  else if (fields.uri) {
    warnings.push('The JSON has a "uri" key, so wallets will treat this as semi-chain metadata')
  }
  if (!Object.keys(fields).length) throw new Error('Add at least one field, e.g. { "name": "My token" }')
  if (fields.decimals !== undefined && !/^\d{1,3}$/.test(fields.decimals)) warnings.push('decimals should be a whole number from 0 to 255')
  return { cell: encodeOnchain(fields, input.format), warnings }
}

/** Off-chain JSON merged under the on-chain keys (TEP-64: on-chain values win). */
export function mergeMetadata(onchain: Record<string, string>, offchain: Record<string, unknown> | null): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(offchain ?? {}), ...onchain }
  if (offchain) delete merged.uri
  return merged
}

export const EXAMPLE_JSON = JSON.stringify({
  name: 'Staked GRAM',
  symbol: 'stGRAM',
  decimals: '9',
  description: 'GRAM liquid staking derivative contract by bemo',
  image: 'https://raw.githubusercontent.com/bemo-fi/tokens/main/stGRAM.png'
}, null, 2)
