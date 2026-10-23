import { defineLinkCategory } from '../types'
import { COIN_NAME } from '../../utils/currency'

export default defineLinkCategory({
  id: 'community',
  title: 'Community & grants',
  description: 'Developer chats, official channels, GitHub orgs and funding programs.',
  icon: 'i-lucide-users',
  order: 16,
  links: [
    { title: 'TON Dev chat (EN)', url: 'https://t.me/tondev_eng', description: 'English developer chat on Telegram.', tags: ['telegram'] },
    { title: 'TON Dev chat (RU)', url: 'https://t.me/tondev', description: 'Russian-language developer chat.', tags: ['telegram'] },
    { title: 'TON channel', url: 'https://t.me/tonblockchain', description: 'Official TON announcements on Telegram.', tags: ['telegram'] },
    { title: 'Gram of TON channel', url: 'https://t.me/gram', description: `Telegram channel about ${COIN_NAME}, linked from ton.org.`, tags: ['telegram'] },
    { title: 'Tact chat', url: 'https://t.me/tactlang', description: 'Tact language chat.', tags: ['telegram', 'tact'] },
    { title: 'Python TON chat', url: 'https://t.me/pythonnton', description: 'Chat for Python TON developers.', tags: ['telegram', 'python'] },
    { title: 'ton4j chat', url: 'https://t.me/ton4java', description: 'Chat for Java and ton4j developers.', tags: ['telegram', 'java'] },
    { title: 'Tonutils Go chat', url: 'https://t.me/tonutils', description: 'Chat for tonutils-go users.', tags: ['telegram', 'go'] },
    { title: 'TON on X', url: 'https://x.com/ton_blockchain', description: 'Official TON account on X.', tags: ['social'] },
    { title: 'r/TONcoin', url: 'https://www.reddit.com/r/TONcoin/', description: 'TON subreddit.', tags: ['social'] },
    { title: 'TON Blockchain GitHub org', url: 'https://github.com/ton-blockchain', description: 'Node, compilers, standards and reference contracts.', tags: ['github'] },
    { title: 'TON Core GitHub org', url: 'https://github.com/ton-org', description: '@ton/core, @ton/ton, Blueprint and Sandbox.', tags: ['github', 'js'] },
    { title: 'TON Community GitHub org', url: 'https://github.com/ton-community', description: 'Community repos, tutorials and SDKs.', tags: ['github'] },
    { title: 'TON Connect GitHub org', url: 'https://github.com/ton-connect', description: 'TON Connect protocol and SDK repos.', tags: ['github', 'tonconnect'] },
    { title: 'TON Society grants & bounties', url: 'https://github.com/ton-society/grants-and-bounties', description: 'TON Society grants and bounties repo (program currently paused).', tags: ['grants', 'bounties'] },
    { title: 'DoraHacks', url: 'https://dorahacks.io', description: 'Hackathon and grants platform that hosts TON hackathons.', tags: ['hackathon'] },
    { title: 'Telegram Contests', url: 'https://t.me/contest', description: 'Telegram contests channel, including TON and Tolk contests.', tags: ['contest'] }
  ]
})
