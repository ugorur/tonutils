import { describe, expect, it } from 'vitest'
import { airdropList, applyFilters, csvRows, jettonHolders, nftOwners, ownerKind, share, summarize, type AddressBook, type JettonWalletItem, type NftItem } from './logic'

// Real toncenter v3 /jetton/wallets?jetton_address=EQCvxJy4…DOGS&limit=3&exclude_zero_balance=true&sort=desc (2026-10-22), trimmed.
const DOGS = '0:AFC49CB8786F21C87045B19EDE78FC6B46C51048513F8E9A6D44060199C1BF0C'
const WALLETS: JettonWalletItem[] = [
  { address: '0:40BD20369AFAB8846D0C878A4DA743B5C96765F6A1F2C5F7AD3215B32DB34F43', balance: '219422529893005000000', owner: '0:F8B8635D0786B77F9DA660E65FD31D670A675DD4302FACBA692F46B571EB5360', jetton: DOGS },
  { address: '0:DA81AB19FD68BEA49393FCC579A9078E8D2BB6372D45E98DBD7C251E2A4E02B3', balance: '26916465446540142847', owner: '0:AD906EF919B1DC0F037F02BA409330F543E934A2EEA0A02CE90569D93F86632D', jetton: DOGS },
  { address: '0:2D78C172CC90A7AE73F99FBC1F3F217D82861795CE71B423C9FEF9150FA5340C', balance: '24521243000088782470', owner: '0:66A1E72196D64D6FAF48FA4B2EA861F67B0484D2D14A59CAF701D8C286CE44E5', jetton: DOGS }
]
const WALLET_BOOK: AddressBook = {
  '0:66A1E72196D64D6FAF48FA4B2EA861F67B0484D2D14A59CAF701D8C286CE44E5': { user_friendly: 'EQBmoechltZNb69I-ksuqGH2ewSE0tFKWcr3AdjChs5E5RVn', domain: null, interfaces: ['wallet_highload_v3r1'] },
  '0:AD906EF919B1DC0F037F02BA409330F543E934A2EEA0A02CE90569D93F86632D': { user_friendly: 'EQCtkG75GbHcDwN_ArpAkzD1Q-k0ou6goCzpBWnZP4ZjLfoA', domain: null, interfaces: ['wallet_highload_v3r1'] }
}

// Real toncenter v3 /nft/items?collection_address=EQAOQdwd… (Anonymous Telegram Numbers)&include_on_sale=true (2026-10-22), 5 items.
const ITEMS: NftItem[] = [
  { address: '0:EFD9AB53A00123E8E0833CEEAC462D067EBA01A42BBDF544815DE0043B663E90', index: '43504682441763416827400347834877369754650086001135951414291322989441831692', owner_address: '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59', real_owner: '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59', on_sale: false },
  { address: '0:1FF93BB5892DAE3FA003AE9BBCBD0C8F7F072A949615BBF4E1EE8051380649C4', index: '377131928856069010366691721340387837643227230504319562195021225806904531146', owner_address: '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59', real_owner: '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59', on_sale: false },
  { address: '0:8AD969B093DF1F2527DBCF756663E8C436298A971CCC4F855EF31D3B39F87C69', index: '426071087979907605327359018738475034668410397843877400662629050088700584951', owner_address: '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59', real_owner: '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59', on_sale: false },
  // listed on Getgems: owner_address is the sale contract, real_owner the seller
  { address: '0:10E15378A235C8F2BBAB665C6FBE5AD54700CD4AEE3E9099B8F392B228E8A94D', index: '282962212036299967477740544800988030793201675628061114503113339209227009254', owner_address: '0:58EEB4087FE29662F73F33BF9E3E37282E7F6698293BA5D47B15D2EC68F742E8', real_owner: '0:07DEE4AFA8D8528D0F4557B9BE55B8E45A7CAFCE790D7AAD823B34C75ECBF2C9', on_sale: true },
  { address: '0:C681750D9E0799288D4EBD92E9F04F89E11EDE765DE17AE1383BBFEE3075C02B', index: '415510410357071319732817811375250878414723164372582122182147061907373716205', owner_address: '0:D0237ACF80EF60527BF0CC6A4EE39B59621A6FEB907E5616153CEF16C924EFFB', real_owner: '0:D0237ACF80EF60527BF0CC6A4EE39B59621A6FEB907E5616153CEF16C924EFFB', on_sale: true }
]
const NFT_BOOK: AddressBook = {
  '0:8244AC6A780CF29A0DA72C70D92750C4BD9C377F08BFB315C6BFC1C098974E59': { user_friendly: 'UQCCRKxqeAzymg2nLHDZJ1DEvZw3fwi_sxXGv8HAmJdOWaiw', domain: null, interfaces: ['wallet_v4r2'] },
  '0:58EEB4087FE29662F73F33BF9E3E37282E7F6698293BA5D47B15D2EC68F742E8': { user_friendly: 'EQBY7rQIf-KWYvc_M7-ePjcoLn9mmCk7pdR7FdLsaPdC6AH6', domain: null, interfaces: ['nft_sale_getgems_v4'] },
  '0:07DEE4AFA8D8528D0F4557B9BE55B8E45A7CAFCE790D7AAD823B34C75ECBF2C9': { user_friendly: 'UQAH3uSvqNhSjQ9FV7m-VbjkWnyvznkNeq2COzTHXsvyyezP', domain: null, interfaces: ['wallet_v4r2'] },
  '0:D0237ACF80EF60527BF0CC6A4EE39B59621A6FEB907E5616153CEF16C924EFFB': { user_friendly: 'UQDQI3rPgO9gUnvwzGpO45tZYhpv65B-VhYVPO8WySTv-9J_', domain: 'merchant.t.me', interfaces: ['wallet_v4r2'] }
}

const lower = (s: string) => s.toLowerCase()

describe('jettonHolders', () => {
  const rows = jettonHolders([...WALLETS].reverse(), WALLET_BOOK)
  it('ranks by balance, keeps exact amounts', () => {
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3])
    expect(rows[0]!.owner).toBe(lower(WALLETS[0]!.owner))
    expect(rows[0]!.amount).toBe(219422529893005000000n)
  })
  it('classifies owners from the address book', () => {
    expect(rows[0]!.kind).toBe('unknown')
    expect(rows[1]!.kind).toBe('wallet')
    expect(rows[1]!.friendly).toBe('EQCtkG75GbHcDwN_ArpAkzD1Q-k0ou6goCzpBWnZP4ZjLfoA')
  })
  it('drops zero balances and merges duplicate owners', () => {
    const extra = [...WALLETS, { ...WALLETS[2]!, balance: '1' }, { ...WALLETS[1]!, owner: '0:' + '1'.repeat(64), balance: '0' }]
    const r = jettonHolders(extra, WALLET_BOOK)
    expect(r).toHaveLength(3)
    expect(r[2]!.amount).toBe(24521243000088782471n)
  })
})

describe('nftOwners', () => {
  const rows = nftOwners(ITEMS, NFT_BOOK)
  it('groups by real owner: listed items count for the seller, not the sale contract', () => {
    expect(rows.map(r => [r.owner.slice(0, 8), r.amount])).toEqual([['0:8244ac', 3n], ['0:07dee4', 1n], ['0:d0237a', 1n]])
    expect(rows.some(r => r.owner.startsWith('0:58eeb4'))).toBe(false)
    expect(rows[1]!.onSale).toBe(1)
    expect(rows[1]!.kind).toBe('wallet')
    expect(rows[2]!.domain).toBe('merchant.t.me')
  })
  it('skips the zero (burn) address', () => {
    // toncenter v3 /nft/items?collection_address=0:01A6AB21…9891 has an item owned by 0:000…000 (burned)
    const burned = { ...ITEMS[0]!, owner_address: `0:${'0'.repeat(64)}`, real_owner: `0:${'0'.repeat(64)}` }
    expect(nftOwners([burned, ITEMS[4]!], NFT_BOOK)).toHaveLength(1)
    expect(jettonHolders([{ ...WALLETS[0]!, owner: `0:${'0'.repeat(64)}` }, WALLETS[1]!], WALLET_BOOK)).toHaveLength(1)
  })
  it('sorts item indexes numerically', () => {
    expect(rows[0]!.items).toEqual([ITEMS[0]!.index, ITEMS[1]!.index, ITEMS[2]!.index])
  })
})

describe('filters and output', () => {
  const rows = jettonHolders(WALLETS, { ...WALLET_BOOK, [WALLETS[0]!.owner]: { user_friendly: 'x', interfaces: ['dedust_vault'] } })
  it('excludes contracts, small balances and listed addresses, then re-ranks', () => {
    expect(rows[0]!.kind).toBe('contract')
    const f = applyFilters(rows, { min: 25000000000000000000n, excludeContracts: true, exclude: new Set() })
    expect(f.map(r => [r.rank, r.amount])).toEqual([[1, 26916465446540142847n]])
    expect(applyFilters(rows, { min: 0n, excludeContracts: false, exclude: new Set([lower(WALLETS[1]!.owner)]) })).toHaveLength(2)
  })
  it('share is exact to 4 decimals', () => {
    expect(share(1n, 3n)).toBe('33.3333')
    expect(share(219422529893005000000n, 548000000000000000000n)).toBe('40.0406')
    expect(share(5n, 0n)).toBe('')
  })
  it('summary, csv and airdrop list', () => {
    expect(summarize(rows)).toEqual({ holders: 3, sum: 270860238339633925317n, contracts: 1 })
    const c = csvRows(rows, { decimals: 9, total: 548000000000000000000n, nft: false, friendly: r => `F${r.slice(2, 6)}` })
    expect(c[0]).toMatchObject({ rank: 1, owner: 'Ff8b8', balance: '219422529893.005', balance_units: 219422529893005000000n, percent: '40.0406', owner_type: 'contract' })
    expect(airdropList(rows.slice(1, 2), 9, r => r)).toBe(`${lower(WALLETS[1]!.owner)},26916465446.540142847`)
    expect(airdropList(nftOwners(ITEMS, NFT_BOOK).slice(0, 1), null, () => 'A')).toBe('A,3')
  })
  it('ownerKind', () => {
    expect(ownerKind(['wallet_v5r1'])).toBe('wallet')
    expect(ownerKind(['airdrop_interlocker_v1', 'wallet_highload_v2'])).toBe('wallet')
    expect(ownerKind(['stonfi_pool_v2'])).toBe('contract')
    expect(ownerKind([])).toBe('unknown')
  })
})
