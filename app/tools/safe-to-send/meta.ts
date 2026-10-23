import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'safe-to-send',
  name: 'Is it safe to send?',
  short: 'Pre-flight check for a destination address before you send GRAM, tokens or an NFT.',
  description: 'Checks a TON address or .ton name before you send: format and network, active or never used, the bounceable-form trap, wallet or contract, scam flags, exchange memo requirement, poisoning-sender behaviour and look-alikes of people in your own history.',
  category: 'security',
  audience: 'user',
  network: 'read',
  privacyNote: 'Your browser queries toncenter and tonapi directly, and loads the public Tonkeeper address-label list from GitHub. Nothing you enter is stored.',
  keywords: ['address checker', 'check address', 'before sending', 'verify recipient', 'bounceable', 'non-bounceable', 'uninit', 'memo', 'exchange deposit', 'scam address', 'is this address safe', 'poisoning', 'testnet address', 'wrong address'],
  related: ['address-poisoning-detector', 'scam-checker', 'address-converter', 'send-ton'],
  icon: 'i-lucide-shield-question',
  featured: true
})
