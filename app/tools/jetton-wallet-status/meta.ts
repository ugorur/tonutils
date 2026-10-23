import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'jetton-wallet-status',
  name: 'USD₮ wallet lock checker',
  short: 'Check if your USD₮ (or other governed token) wallet was locked by the issuer.',
  description: 'Governed tokens like USD₮ on TON let the issuer lock a holder\'s jetton wallet so it cannot send, receive, or both. Enter your wallet address to see the current lock status, when it was locked or unlocked, and what it means for you.',
  category: 'jettons',
  audience: 'user',
  network: 'read',
  keywords: ['USDT', 'USD₮', 'Tether', 'frozen', 'locked', 'blocked', 'freeze', 'blacklist', 'get_status', 'set_status', 'governed jetton', 'stablecoin', 'cannot send USDT'],
  related: ['jetton-wallet-address-calculator', 'jetton-history', 'jetton-info'],
  icon: 'i-lucide-lock-keyhole'
})
