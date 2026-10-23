import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-metadata-codec',
  name: 'Jetton metadata encoder / decoder',
  short: 'Decode a jetton\'s TEP-64 content cell into JSON, or build an on-chain / off-chain content cell.',
  description: 'Read the metadata cell of any jetton master (on-chain, off-chain or semi-chain, snake or chunked values) and see every key, or encode your own metadata JSON into the exact content cell a jetton minter stores.',
  category: 'jettons',
  audience: 'dev',
  network: 'read',
  privacyNote: 'Cells are encoded and decoded in your browser. When you check a metadata URL, it is fetched through a small checker on this site, because most hosts send no CORS headers. Only the URL is passed on and nothing is stored.',
  keywords: ['tep-64', 'tep64', 'jetton metadata', 'token metadata', 'content cell', 'onchain metadata', 'offchain metadata', 'semichain', 'snake', 'chunked', 'jetton_content', 'get_jetton_data', 'decimals', 'symbol', 'image_data', 'minter'],
  related: ['metadata-validator', 'nft-content-codec', 'snake-string-codec', 'dictionary-codec'],
  icon: 'i-lucide-file-json'
})
