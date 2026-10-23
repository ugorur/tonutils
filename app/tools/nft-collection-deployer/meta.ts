import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-collection-deployer',
  name: 'NFT collection deployer',
  short: 'Create a TEP-62 NFT collection, mint items one by one or in batches, edit content or change owner.',
  description: 'Deploy a standard NFT collection (the same getgems contract TON Diamonds uses) from your own wallet, set royalties, mint single items or batches of up to 100 per message, then edit its metadata or hand over ownership. Every message is shown before you sign it.',
  category: 'token-launch',
  audience: 'user',
  network: 'wallet',
  keywords: ['nft', 'collection', 'mint', 'minting', 'deploy', 'create nft', 'batch mint', 'tep-62', 'tep-64', 'tep-66', 'royalty', 'getgems', 'nft-collection-editable', 'change owner', 'metadata', 'launch'],
  related: ['nft-content-codec', 'nft-collection-info', 'nft-viewer'],
  icon: 'i-lucide-image-plus'
})
