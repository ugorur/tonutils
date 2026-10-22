// The fixed category list. Tool builders pick one of these ids in meta.ts.
// Adding a category is a deliberate change: keep ids kebab-case and stable (they are URLs).
export const CATEGORIES = {
  'address': {
    name: 'Addresses',
    icon: 'i-lucide-at-sign',
    description: 'Convert, validate and inspect TON addresses in every format.'
  },
  'wallet-keys': {
    name: 'Wallets & keys',
    icon: 'i-lucide-key-round',
    description: 'Mnemonics, key pairs and wallet contract addresses, computed in your browser.'
  },
  'units-format': {
    name: 'Units & formatting',
    icon: 'i-lucide-scale',
    description: 'TON, nanoTON and jetton amounts with exact integer math.'
  },
  'cells-boc': {
    name: 'Cells & BOC',
    icon: 'i-lucide-boxes',
    description: 'Parse, build and inspect cells and bag-of-cells data.'
  },
  'contracts': {
    name: 'Smart contracts',
    icon: 'i-lucide-file-code-2',
    description: 'Get-methods, contract state, code hashes and deployment helpers.'
  },
  'transactions': {
    name: 'Transactions',
    icon: 'i-lucide-arrow-left-right',
    description: 'Look up, decode and build transactions and messages.'
  },
  'jettons': {
    name: 'Jettons',
    icon: 'i-lucide-coins',
    description: 'Fungible tokens: metadata, balances, wallets and transfers.'
  },
  'nfts': {
    name: 'NFTs',
    icon: 'i-lucide-image',
    description: 'Collections, items, ownership and metadata.'
  },
  'dns-domains': {
    name: 'DNS & domains',
    icon: 'i-lucide-globe',
    description: '.ton and .t.me names: resolve, look up and inspect records.'
  },
  'explorer-lookup': {
    name: 'Lookup',
    icon: 'i-lucide-search',
    description: 'Quick account, balance and block lookups without leaving the toolbox.'
  },
  'network-stats': {
    name: 'Network',
    icon: 'i-lucide-activity',
    description: 'Validators, config parameters, fees and live chain status.'
  },
  'crypto-encoding': {
    name: 'Crypto & encoding',
    icon: 'i-lucide-binary',
    description: 'Hashes, signatures, base64, hex and CRC helpers.'
  },
  'developer-misc': {
    name: 'Developer utilities',
    icon: 'i-lucide-wrench',
    description: 'Small helpers for people building on TON.'
  },
  'security': {
    name: 'Safety checks',
    icon: 'i-lucide-shield-check',
    description: 'Spot scams, check signatures and verify what you are about to sign.'
  }
} as const satisfies Record<string, { name: string, icon: string, description: string }>

export type CategoryId = keyof typeof CATEGORIES
export const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[]

export function isCategoryId(value: string): value is CategoryId {
  return value in CATEGORIES
}
