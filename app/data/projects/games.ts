import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'games',
  title: 'Games & Mini Apps',
  description: 'Telegram games and Mini Apps built on TON.',
  icon: 'i-lucide-gamepad-2',
  order: 5,
  projects: [
    { name: 'Notcoin', url: 'https://notcoin.org', description: 'The tap-to-earn game that brought millions to TON; NOT is now a major community jetton.', tags: ['game', 'mini-app', 'jetton'], featured: true },
    { name: 'Hamster Kombat', url: 'https://hamsterkombatgame.io', description: 'Telegram game whose HMSTR token launched on TON.', tags: ['game', 'mini-app', 'jetton'] },
    { name: 'Catizen', url: 'https://catizen.ai', description: 'Cat-themed Telegram game and Mini App game platform with the CATI token.', tags: ['game', 'mini-app', 'jetton'] },
    { name: 'DOGS', url: 'https://onetime.dog', description: 'Community memecoin Mini App with one of the largest airdrops on TON.', tags: ['mini-app', 'memecoins'] },
    { name: 'Blum', url: 'https://blum.io', description: 'Memepad and trading bot for launching and trading memecoins in Telegram.', tags: ['mini-app', 'memecoins', 'launchpad'] },
    { name: 'Pixelverse', url: 'https://pixelverse.xyz', description: 'Gaming studio shipping Mini App games on Telegram.', tags: ['game', 'mini-app'] },
    { name: 'TON Station', url: 'https://tonstation.app', description: 'Game distribution and rewards platform inside Telegram.', tags: ['game', 'mini-app'] }
  ]
})
