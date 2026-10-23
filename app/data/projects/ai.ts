import { COIN_NAME } from '../../utils/currency'
import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'ai',
  title: 'AI',
  description: 'Private AI compute and tools that let AI agents use TON.',
  icon: 'i-lucide-bot',
  order: 11,
  projects: [
    { name: 'Cocoon', url: 'https://cocoon.org', description: `Telegram's confidential compute network for private AI inference; GPU owners earn ${COIN_NAME}.`, tags: ['ai', 'telegram'], featured: true },
    { name: 'TON MCP portal', url: 'https://mcp.ton.org', description: 'Official catalog of MCP servers and agent skills for TON.', tags: ['ai', 'official'] },
    { name: '@ton/mcp', url: 'https://docs.ton.org/onboarding/ai/mcp', description: 'Official MCP server (alpha) that gives AI agents a wallet: balances, transfers, swaps, DNS.', tags: ['ai', 'official', 'open-source'] }
  ]
})
