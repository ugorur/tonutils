import { defineTool } from '~/utils/tool'

export default defineTool({
  slug: 'dns-expiry-checker',
  name: 'Domain expiry checker',
  short: 'See when each .ton domain of a wallet expires and save renewal reminders to your calendar.',
  description: 'Lists every .ton domain a wallet owns, sorted by expiry date read from each domain contract. A domain not renewed within a year can be taken by anyone at auction, so download a calendar (.ics) reminder or a CSV.',
  category: 'dns-domains',
  audience: 'user',
  network: 'read',
  keywords: ['ton dns', '.ton', 'domain', 'expiry', 'expiration', 'renew', 'renewal', 'reminder', 'calendar', 'ics', 'my domains', 'release', 'expire'],
  related: ['dns-renew', 'dns-lookup', 'dns-reverse', 'dns-bulk-availability'],
  icon: 'i-lucide-calendar-clock'
})
