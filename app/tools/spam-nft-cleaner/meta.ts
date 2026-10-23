import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'spam-nft-cleaner',
  name: 'Spam NFT cleaner',
  short: 'Find scam and spam NFTs in a wallet, test which can really be burned, and burn those in one go.',
  description: 'Flags scam "voucher" and airdrop NFTs with tonapi\'s spam list and text checks, emulates a transfer of each one against its real contract to catch traps that keep the coins you attach, then burns only the safe ones (sends them to the zero address) in batches.',
  category: 'nfts',
  audience: 'user',
  network: 'wallet',
  keywords: ['spam', 'scam', 'nft', 'burn', 'remove', 'delete nft', 'clean wallet', 'voucher', 'airdrop scam', 'fake nft', 'phishing', 'hide', 'zero address', 'blacklist'],
  related: ['nft-listing-manager', 'nft-gallery'],
  icon: 'i-lucide-flame'
})
