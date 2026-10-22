import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'infrastructure',
  title: 'Infrastructure',
  description: 'APIs, consoles and app directories.',
  icon: 'i-lucide-server',
  order: 4,
  projects: [
    { name: 'TON Console', url: 'https://tonconsole.com', description: 'Developer console for TonAPI keys, webhooks and analytics.' },
    { name: 'TON App', url: 'https://ton.app', description: 'Directory of apps and services in the TON ecosystem.' }
  ]
})
