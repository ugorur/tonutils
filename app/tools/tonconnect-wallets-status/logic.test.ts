import { describe, expect, it } from 'vitest'
import { LEGACY_MAX_MESSAGES, summarizeFeatures } from '~/lib/dev-tonconnect/features'
import { eventsUrl, filterWallets, parseWalletList, randomClientId, toCsvRows, uniqueBridges } from './logic'
// Snapshot of https://config.ton.org/wallets-v2.json downloaded with curl on 2026-10-23 (38 entries,
// identical app_name order to github.com/ton-blockchain/wallets-list wallets-v2.json).
import list from './fixtures/wallets-v2.2026-10-23.json'

const rows = parseWalletList(list)
const byApp = (a: string) => rows.find(r => r.appName === a)!

describe('parseWalletList (real wallets-v2.json)', () => {
  it('parses every entry and finds no spec problems in the official list', () => {
    expect(rows).toHaveLength(38)
    expect(rows.flatMap(r => r.issues.map(i => `${r.appName}: ${i}`))).toEqual([])
  })

  it('Tonkeeper (listed as "Keeper"): tonapi bridge, js key, 255 messages, extra currencies, all signData types', () => {
    const t = byApp('tonkeeper')
    expect(t.sseBridge).toBe('https://bridge.tonapi.io/bridge')
    expect(t.jsKey).toBe('tonkeeper')
    expect(t.features.sendTransaction).toEqual({ maxMessages: 255, extraCurrency: true, itemTypes: [] })
    expect(t.features.signData).toEqual(['text', 'binary', 'cell'])
    expect(t.features.signMessage).toBeNull()
  })

  it('Telegram: own bridge, no extra currencies; SafePal: 1 message; OpenMask: extension with js bridge only', () => {
    expect(byApp('telegram').sseBridge).toBe('https://tonbridge.telegram.org')
    expect(byApp('telegram').features.sendTransaction?.extraCurrency).toBe(false)
    expect(byApp('safepalwallet').features.sendTransaction?.maxMessages).toBe(1)
    expect(byApp('openmask').sseBridge).toBeUndefined()
    expect(byApp('openmask').jsKey).toBe('openmask')
    expect(byApp('openmask').platforms).toEqual(['chrome'])
  })

  it('normalizes the MyTonWallet bridge trailing slash and dedupes shared bridges', () => {
    expect(byApp('mytonwallet').sseBridge).toBe('https://tonconnectbridge.mytonwallet.org/bridge')
    const b = uniqueBridges(rows)
    expect(new Set(b.map(x => x.url)).size).toBe(b.length)
    expect(b).toHaveLength(25)
    // connect.ton.org/bridge is shared by sparx, walletverse, bron, sociawallet
    expect(b.find(x => x.url === 'https://connect.ton.org/bridge')?.wallets).toHaveLength(4)
    expect(b.find(x => x.url === 'https://bridge.tonapi.io/bridge')?.wallets).toEqual(['Keeper', 'Tonkeeper Pro'])
  })

  it('flags entries that break the spec', () => {
    const [bad] = parseWalletList([{ app_name: 'x', name: 'X', image: 'https://x.io/i.svg', about_url: 'http://x.io', bridge: [{ type: 'sse', url: 'https://b.x.io' }], platforms: ['beos'], features: [] }])
    expect(bad!.issues).toEqual([
      'image must be an https URL ending in .png',
      'about_url must be an https URL',
      'universal_url is required with an sse bridge',
      'unknown platform: beos',
      'features is empty'
    ])
    expect(bad!.aboutUrl).toBe('')
    const [js] = parseWalletList([{ name: 'J', about_url: 'javascript:alert(1)', image: 'javascript:alert(1)' }])
    expect([js!.aboutUrl, js!.image]).toEqual(['', ''])
    expect(() => parseWalletList({})).toThrow()
  })
})

describe('summarizeFeatures', () => {
  it('treats the deprecated bare "SendTransaction" string as 4 messages (SDK SendTransactionFeatureDeprecated)', () => {
    const f = summarizeFeatures(['SendTransaction'])
    expect(f.legacySendTransaction).toBe(true)
    expect(f.sendTransaction?.maxMessages).toBe(LEGACY_MAX_MESSAGES)
  })
  it('reads SignMessage, itemTypes and EmbeddedRequest (wallets-list.md § features shapes)', () => {
    const f = summarizeFeatures([
      'SendTransaction',
      { name: 'SendTransaction', maxMessages: 255, extraCurrencySupported: true, itemTypes: ['ton', 'jetton', 'nft'] },
      { name: 'SignMessage', maxMessages: 4 },
      { name: 'EmbeddedRequest' }
    ])
    expect(f.legacySendTransaction).toBe(false)
    expect(f.sendTransaction).toEqual({ maxMessages: 255, extraCurrency: true, itemTypes: ['ton', 'jetton', 'nft'] })
    expect(f.signMessage).toEqual({ maxMessages: 4, extraCurrency: false, itemTypes: [] })
    expect(f.embeddedRequest).toBe(true)
    expect(summarizeFeatures(undefined).sendTransaction).toBeNull()
  })
})

describe('helpers', () => {
  it('builds the /events URL from bridge.md and a 64-hex client id', () => {
    const id = 'ab'.repeat(32)
    expect(eventsUrl('https://tonconnectbridge.mytonwallet.org/bridge/', id)).toBe(`https://tonconnectbridge.mytonwallet.org/bridge/events?client_id=${id}&heartbeat=message`)
    expect(randomClientId()).toMatch(/^[0-9a-f]{64}$/)
  })

  it('filters by text, platform and features', () => {
    expect(filterWallets(rows, { q: 'tonkeeper', platform: '', signData: false, extraCurrency: false }).map(r => r.appName)).toEqual(['tonkeeper', 'tonkeeper-pro'])
    const safari = filterWallets(rows, { q: '', platform: 'safari', signData: false, extraCurrency: false }).map(r => r.appName)
    expect(safari).toEqual(['okxWallet', 'okxTonWallet', 'defiway'])
    const ec = filterWallets(rows, { q: '', platform: '', signData: true, extraCurrency: true }).map(r => r.appName)
    expect(ec).toEqual(['telegram-wallet', 'tonkeeper', 'tonhub', 'tonkeeper-pro', 'sociawallet'])
  })

  it('flattens rows for CSV', () => {
    expect(toCsvRows([byApp('tonhub')])[0]).toMatchObject({ app_name: 'tonhub', max_messages: 255, sign_data: 'text binary cell', sse_bridge: 'https://connect.tonhubapi.com/tonconnect' })
  })
})
