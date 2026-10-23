import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'telegram',
  title: 'Telegram Mini Apps & bots',
  description: 'Build apps and bots that live inside Telegram.',
  icon: 'i-lucide-send',
  order: 13,
  links: [
    { title: 'Telegram Mini Apps docs', url: 'https://core.telegram.org/bots/webapps', description: 'Official Telegram documentation for Mini Apps.', tags: ['tma'] },
    { title: 'Telegram Bot API', url: 'https://core.telegram.org/bots/api', description: 'Official Telegram Bot API reference.', tags: ['bots'] },
    { title: 'Telegram Mini Apps community docs', url: 'https://docs.telegram-mini-apps.com', description: 'Community docs and the @tma.js SDK.', tags: ['tma', 'docs'] },
    { title: 'Telegram Mini Apps GitHub', url: 'https://github.com/Telegram-Mini-Apps', description: 'GitHub org for the @tma.js packages and templates.', tags: ['tma', 'github'] },
    { title: 'twa-dev SDK', url: 'https://github.com/twa-dev/sdk', description: 'npm wrapper for the Telegram WebApp object.', tags: ['tma', 'js'] }
  ]
})
