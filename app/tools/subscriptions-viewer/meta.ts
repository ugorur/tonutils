import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'subscriptions-viewer',
  name: 'Wallet subscriptions and plugins',
  short: 'See which subscriptions, plugins or W5 extensions can take funds from a wallet without asking.',
  description: 'Enter a wallet address to list every contract that can pull funds from it without a new signature: wallet v4 subscription plugins and W5 extensions, read straight from the wallet, with the amount, schedule and recipient tonapi knows for each. Flags unknown plugins and W5 wallets whose own key was switched off.',
  category: 'security',
  audience: 'user',
  network: 'read',
  keywords: ['subscriptions', 'plugins', 'extensions', 'w5 extensions', 'wallet v4 plugin', 'recurring payments', 'tonkeeper pro', 'drainer', 'revoke', 'cancel subscription', 'who can withdraw', 'signature disabled', 'allowance', 'approvals'],
  related: ['wallet-version-detector', 'wallet-v5-actions-builder', 'account-overview', 'address-poisoning-detector'],
  icon: 'i-lucide-repeat'
})
