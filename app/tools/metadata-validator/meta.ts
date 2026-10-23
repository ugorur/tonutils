import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'metadata-validator',
  name: 'Jetton & NFT metadata validator',
  short: 'Why does my token or NFT show no name or image? Check the metadata like a wallet would.',
  description: 'Checks a jetton or NFT end to end: the TEP-64 content cell, the metadata URI, the JSON fields (name, symbol, decimals as a string, image), the image file type, size and dimensions, and what tonapi (Tonkeeper) actually shows.',
  category: 'jettons',
  audience: 'both',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly. Metadata and image URLs are fetched through a small checker on this site, because most hosts send no CORS headers. Only the URL is passed on and nothing is stored.',
  keywords: ['metadata', 'validator', 'tep-64', 'jetton image', 'token icon', 'nft image not showing', 'tonkeeper', 'json', 'ipfs', 'cors', 'decimals', 'symbol', 'getgems', 'debug'],
  related: ['jetton-metadata-codec', 'snake-string-codec'],
  icon: 'i-lucide-badge-check'
})
