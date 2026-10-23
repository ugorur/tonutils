import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { parseItemData, RECORD_KEYS } from '~/lib/dns-write/dns'
import fx from '~/lib/dns-write/fixtures/mainnet.json'
import { editMessages, formFromRecords, planChanges, recordValue } from './logic'

// foundation.ton item state: toncenter v3 /accountStates, mainnet, 2026-10-22. Its records per toncenter v3 /dns/records:
// dns_wallet 0:83DF…31A8, dns_site_adnl UWYYz2y+…kXQ= (base64), dns_storage_bag_id f+p68jJf…hUE= (base64).
const foundation = parseItemData(Cell.fromBase64(fx.items.foundation.data_boc))
const FIRE = Address.parse('0:963ebb44505714095eec3683f066bd7360950be208efe2c730b3235585d7e65c')
const h = (c: unknown) => (typeof c === 'string' ? Cell.fromBase64(c) : c as Cell).hash().toString('hex')
const b64hex = (b: string) => Buffer.from(b, 'base64').toString('hex')

describe('formFromRecords', () => {
  it('shows the on-chain records of foundation.ton', () => {
    const f = formFromRecords(foundation.records, false)
    expect(Address.parse(f.wallet).toRawString()).toBe('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
    expect(f.wallet.startsWith('UQ')).toBe(true)
    expect(f).toMatchObject({ siteType: 'adnl', site: b64hex('UWYYz2y+kAT2iD50LJouPKU+0C4+NvTO9iqY7h5EkXQ='), storage: b64hex('f+p68jJfCltpCJOcnXL5LbTAylLMqM4sSLsnCL8YhUE='), resolver: '' })
  })
})

describe('planChanges', () => {
  const initial = formFromRecords(foundation.records, false)
  it('no edits → no messages', () => {
    expect(planChanges(foundation.records, initial, { ...initial })).toEqual({ changes: [], errors: [] })
  })
  it('re-entering the same value in another form (EQ vs UQ, uppercase hex, .adnl form) is not a change', () => {
    const wallet = Address.parse(initial.wallet).toString({ bounceable: true })
    // .adnl form of the same ADNL: base32(0x2d ‖ adnl ‖ crc16-xmodem) minus the first char, computed with Python's binascii.crc_hqx.
    const site = 'viwmggpns7jabhwra7hile2fy6kkpwqfy7dn5go6yvjr3q6isixjwkf'
    const r = planChanges(foundation.records, initial, { ...initial, wallet, site, storage: initial.storage.toUpperCase() })
    expect(r.changes).toEqual([])
  })
  it('clearing a field removes the record; filling an empty one sets it', () => {
    const r = planChanges(foundation.records, initial, { ...initial, storage: '', resolver: 'EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz' })
    expect(r.changes.map(c => c.summary)).toEqual(['Remove TON Storage', 'Set Subdomain resolver'])
  })
  it('reports bad input instead of sending it', () => {
    const r = planChanges(foundation.records, initial, { ...initial, wallet: 'not-an-address', site: 'xyz' })
    expect(r.changes).toEqual([])
    expect(r.errors).toHaveLength(2)
  })
  it('a site hosted in TON Storage is a storage record under the "site" key', () => {
    const f = { ...initial, siteType: 'storage' as const, site: initial.storage }
    const v = recordValue('site', f)!
    expect(h(v)).toBe(h(foundation.records.get(RECORD_KEYS.storage)!))
  })
})

describe('editMessages', () => {
  // Real txs to the fire.ton item (toncenter v3 /transactions): set wallet qcJu6SGb…, delete wallet xkSLfEGM…, query_id 0.
  it('set wallet record = real tx body', () => {
    const empty = new Map<bigint, Cell>()
    const init = formFromRecords(empty, false)
    const { changes } = planChanges(empty, init, { ...init, wallet: '0:6F8D7AC29334BCC3E3600A26FF8B53336C184C31E6B7150AC9F375075BA04695' })
    const [m] = editMessages(FIRE, changes, false)
    expect(m!.amount).toBe(50_000_000n)
    expect(m!.address).toBe(FIRE.toString({ bounceable: true, urlSafe: true }))
    expect(h(m!.payload)).toBe(h('te6cckEBAgEAVgABWE6x8PkAAAAAAAAAAOjUQFCHPbqGWqfBcKtMzmTZCDmjTc/Wz3HRTgIFRDsbAQBJn9OADfGvWFJml5h8bAFE3/FqZm2DCYY81uKhWT5uoOt0CNKgEF9XOMc='))
  })
  it('remove wallet record = real tx body', () => {
    const rec = new Map([[RECORD_KEYS.wallet, recordValue('wallet', { wallet: '0:6F8D7AC29334BCC3E3600A26FF8B53336C184C31E6B7150AC9F375075BA04695', siteType: 'adnl', site: '', storage: '', resolver: '' })!]])
    const init = formFromRecords(rec, false)
    const { changes } = planChanges(rec, init, { ...init, wallet: '' })
    const [m] = editMessages(FIRE, changes, false)
    expect(h(m!.payload)).toBe(h('te6cckEBAQEALgAAWE6x8PkAAAAAAAAAAOjUQFCHPbqGWqfBcKtMzmTZCDmjTc/Wz3HRTgIFRDsb6aFTQw=='))
  })
})
