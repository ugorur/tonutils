import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'tonconnect-tx-tester',
  name: 'TonConnect transaction tester',
  short: 'Paste a sendTransaction request, check it against the spec and your wallet, send it, see the trace.',
  description: 'Test TonConnect requests against a real wallet: paste or build a sendTransaction / signMessage request (messages, structured items, extra currencies, from, network), validate it against the spec and the connected wallet\'s features, send it, and follow the returned BOC, its normalized hash and the on-chain trace. Also tests signData (text, binary, cell).',
  category: 'developer-misc',
  audience: 'dev',
  network: 'wallet',
  keywords: ['tonconnect', 'ton connect', 'sendTransaction', 'signMessage', 'signData', 'test wallet', 'dapp testing', 'maxMessages', 'validUntil', 'extra currency', 'structured items', 'boc', 'message hash', 'trace', 'wallet features', 'debug'],
  related: ['tonconnect-wallets-status', 'tonconnect-manifest-tool', 'verify-signature', 'message-hash-tool'],
  icon: 'i-lucide-test-tube'
})
