import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'holders-snapshot',
  name: 'Holders snapshot',
  short: 'All holders of a jetton or owners of an NFT collection, filtered and exported to CSV.',
  description: 'Take a snapshot of every holder of a jetton (balance and share of supply) or every owner of an NFT collection (item count, listed items counted for the seller). Filter out DEX pools and other contracts, set a minimum balance and export a CSV or an airdrop list.',
  category: 'jettons',
  audience: 'both',
  network: 'read',
  keywords: ['holders', 'snapshot', 'airdrop', 'token holders', 'nft owners', 'export csv', 'governance', 'whitelist', 'distribution', 'rich list'],
  related: ['token-list', 'jetton-admin-panel', 'bulk-balance-checker'],
  icon: 'i-lucide-camera'
})
