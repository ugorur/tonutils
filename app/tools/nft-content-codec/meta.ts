import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-content-codec',
  name: 'NFT content & royalty codec',
  short: 'Build or decode TEP-64 NFT content, collection content and TEP-66 royalty cells; read them on-chain',
  description: 'Encode collection and item content (off-chain URL or on-chain fields), the common_content base URL and royalty params into cells, or decode any such BOC. Paste a collection or item address to see its raw content and the full metadata URL it resolves to.',
  category: 'nfts',
  audience: 'dev',
  network: 'read',
  keywords: ['tep-64', 'tep-66', 'nft content', 'metadata', 'collection content', 'common_content', 'individual content', 'get_nft_content', 'royalty_params', 'royalty', 'offchain', 'onchain', 'snake', 'sha256 keys', 'boc', 'cell'],
  related: ['nft-collection-deployer', 'jetton-metadata-codec', 'snake-string-codec', 'get-method-runner'],
  icon: 'i-lucide-file-code-2'
})
