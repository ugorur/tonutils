import type { CategoryId } from './categories'

export type ToolAudience = 'user' | 'dev' | 'both'
/** offline: pure browser math. read: calls public read APIs. wallet: needs a TonConnect signature. */
export type ToolNetwork = 'offline' | 'read' | 'wallet'

export interface ToolMeta {
  /** Must equal the folder name under app/tools/. Used in the URL /tools/<slug>. */
  slug: string
  /** Display name, sentence case. */
  name: string
  /** One line for cards and search results (max ~80 chars). */
  short: string
  /** One or two sentences for the tool page and SEO description. */
  description: string
  category: CategoryId
  audience: ToolAudience
  network: ToolNetwork
  /** Extra search terms (synonyms, formats, jargon). */
  keywords: string[]
  /** Slugs of related tools, shown under the tool. */
  related?: string[]
  /** Lucide icon, e.g. 'i-lucide-at-sign'. Write it as a literal so the icon bundler finds it. */
  icon: string
  /**
   * Replaces the network privacy line under the tool when it is not the whole story: name every third-party
   * host the browser calls and any server/api/tools route the tool relays through.
   */
  privacyNote?: string
  /** Shown in the "Popular" strip on the home page. */
  featured?: boolean
}

export function defineTool(meta: ToolMeta): ToolMeta {
  return meta
}

export const AUDIENCE_LABELS: Record<ToolAudience, string> = {
  user: 'For everyone',
  dev: 'For developers',
  both: 'Users & developers'
}

export const NETWORK_INFO: Record<ToolNetwork, { label: string, icon: string, detail: string }> = {
  offline: {
    label: 'Runs locally in your browser',
    icon: 'i-lucide-shield-check',
    detail: 'Nothing you type here is sent anywhere. You can disconnect from the internet and it still works.'
  },
  read: {
    label: 'Reads public chain data',
    icon: 'i-lucide-radio-tower',
    detail: 'Your browser queries public TON APIs (toncenter, tonapi) directly. We run no server in between and store nothing you enter.'
  },
  wallet: {
    label: 'Signs with your wallet',
    icon: 'i-lucide-wallet',
    detail: 'Transactions are approved in your own wallet through TonConnect. This site never sees your keys.'
  }
}
