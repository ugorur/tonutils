import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dictionary-codec',
  name: 'Dictionary (HashmapE) encoder and decoder',
  short: 'Decode a TON dictionary cell to JSON, or build one from JSON. Jetton metadata, airdrops, configs.',
  description: 'Paste a dictionary BOC, pick the key type and value fields, and read every entry as JSON. Or write JSON and get the HashmapE, Hashmap root and TEP-64 content cells. Presets for on-chain jetton/NFT metadata, mintless airdrop lists and address → amount maps.',
  category: 'cells-boc',
  audience: 'dev',
  network: 'offline',
  keywords: ['dictionary', 'dict', 'hashmap', 'HashmapE', 'Dictionary.load', 'storeDict', 'TEP-64', 'on-chain metadata', 'jetton content', 'nft content', 'snake', 'airdrop', 'whitelist', 'config', 'BOC', 'cell'],
  related: ['merkle-proof-tool', 'stateinit-builder', 'tvm-stack-codec'],
  icon: 'i-lucide-braces'
})
