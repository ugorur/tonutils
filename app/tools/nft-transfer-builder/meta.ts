import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'nft-transfer-builder',
  name: 'NFT & SBT message builder',
  short: 'Build TEP-62 NFT transfer / get_static_data and TEP-85 SBT messages; send via TonConnect.',
  description: 'Build exact NFT transfer and get_static_data bodies, or soulbound token (SBT) prove_ownership, request_owner, destroy and revoke messages. Checks the item owner and sale status, shows the BOC and a ton:// link, and sends from your wallet through TonConnect.',
  category: 'transactions',
  audience: 'dev',
  network: 'wallet',
  keywords: ['nft', 'nft transfer', 'TEP-62', 'TEP-85', 'sbt', 'soulbound', '0x5fcc3d14', 'prove_ownership', 'request_owner', 'destroy', 'revoke', 'get_static_data', 'forward_payload', 'telegram gift', 'collectible', 'payload', 'BOC'],
  related: ['jetton-transfer-builder', 'send-mode-calculator'],
  icon: 'i-lucide-image'
})
