import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tonconnect-wallets-status',
  name: 'TonConnect wallets and bridge status',
  short: 'Every TonConnect wallet with its platforms, features and bridge, plus a live bridge check.',
  description: 'Browse every wallet in the official TonConnect wallets list: platforms, max messages per request, extra currency and signData support, bridge URL and JS key. Your browser opens a test connection to each wallet bridge and shows which ones answer right now.',
  category: 'developer-misc',
  audience: 'dev',
  network: 'read',
  privacyNote: 'Your browser loads the official wallets list (config.ton.org, GitHub) and opens a test connection to each wallet bridge directly. Nothing is stored.',
  keywords: ['tonconnect', 'ton connect', 'wallets list', 'wallets-v2.json', 'bridge', 'sse bridge', 'bridge status', 'maxMessages', 'signData', 'signMessage', 'extra currency', 'tonkeeper', 'telegram wallet', 'mytonwallet', 'tonhub', 'uptime', 'wallet support'],
  related: ['tonconnect-tx-tester', 'tonconnect-manifest-tool', 'tonconnect-link-decoder', 'network-status'],
  icon: 'i-lucide-plug-zap'
})
