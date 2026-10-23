import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'library-publisher',
  name: 'Public library publisher',
  short: 'Publish a code cell as a public masterchain library, with the exact 10-year storage cost.',
  description: 'Publish a cell (usually contract code) as a public library in the masterchain with the official librarian contract, so contracts can reference it by hash like Jetton 2.0 and W5 wallets do. Shows the masterchain storage cost from the live config before you send.',
  category: 'contracts',
  audience: 'dev',
  network: 'wallet',
  keywords: ['library', 'public library', 'library cell', 'librarian', 'SETLIBCODE', 'masterchain', 'exotic cell', 'code by hash', 'jetton 2.0', 'storage fee', 'config 18', 'deploy library'],
  related: ['library-cell-resolver', 'contract-deployer', 'stateinit-builder'],
  icon: 'i-lucide-library-big'
})
