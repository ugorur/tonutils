import { Address } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { NATIVE, POPULAR, floatToUnits } from '~/lib/prices-defi/assets'
import type { SwapCoffeeRoute } from '~/lib/prices-defi/swapcoffee'
import type { DexContracts } from '~/lib/prices-defi/swapcoffee'
import { checkSwapTxs, dedustAssetSlice, routeLabel, routeParts, stonfiContracts, swapTargets, toMessages, transactionsBody } from '~/lib/prices-defi/swapcoffee'
import { decodeBody } from '~/utils/ton/messages'
import { assetParam, balanceProblem } from './logic'
// Real swap.coffee answers (2026-10-23) for wallet UQBpY9MN…byThr (a USD₮ holder found via toncenter /api/v3/jetton/wallets):
import txTonUsdt from './fixture-tx-ton-usdt.json' // POST /v2/route/transactions for 10 GRAM -> USD₮
import txUsdtNot from './fixture-tx-usdt-not.json' // same for 250 USD₮ -> NOT (3-way split)
import routeUsdtNot from './fixture-route-usdt-not.json' // POST /v1/route for 250 USD₮ -> NOT
// Same wallet as sender_address (reviewer, 2026-10-23): 50 GRAM -> NOT (STON.fi v2 pTON + DeDust native vault),
// 3000 GRAM -> USD₮ (STON.fi v2, TONCO, DeDust, STON.fi v1).
import txTonNot from './fixture-tx-ton-not.json'
import txTon4way from './fixture-tx-ton-usdt-4way.json'
// GET https://api.ston.fi/v1/routers (2026-10-23, reviewer), fields trimmed.
import routers from './fixture-stonfi-routers.json'

const USDT = POPULAR.find(a => a.symbol === 'USD₮')!
// toncenter /api/v3/jetton/wallets?owner_address=UQBpY9MN…&jetton_address=<USD₮> -> this address.
const USER_USDT_WALLET = '0:000006ACA4ACC5AE154FCE8CE78E8E211FB89233966D3D01FF873DCB532E9107'
// The sender_address the message sets were requested for.
const OWNER = 'EQBpY9MNLFOnwqL2A8dqMuefpgrcUDED2t2uWWPaHNibyWWu'
const OTHER = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
const OK = { errors: [], notes: [], unverified: 0 }
// DeDust vaults from toncenter POST /api/v3/runGetMethod get_vault_address on the DeDust factory (2026-10-23, reviewer);
// tonapi names them "DeDust USDT vault" and tags both dedust_vault.
const DEDUST_NATIVE_VAULT = Address.parse('0:dae153a74d894bbc32748198cd626e4f5df4a69ad2fa56ce80fc2644b5708d20')
const DEDUST_USDT_VAULT = Address.parse('0:18aa8e2eed51747dae033c079b93883d941cad8f65459f2ee9cd7474b6b8ed5d')
const ston = stonfiContracts(routers)
const NATIVE_DEXES: DexContracts = { ...ston, dedustVault: DEDUST_NATIVE_VAULT }
const USDT_DEXES: DexContracts = { ...ston, dedustVault: DEDUST_USDT_VAULT }

describe('swap.coffee messages: GRAM input', () => {
  it('passes the checks and goes to the STON.fi v1 router pTON wallet with a STON.fi swap payload', () => {
    expect(checkSwapTxs(txTonUsdt.transactions, { from: NATIVE, units: 10_000_000_000n, owner: OWNER, dexes: NATIVE_DEXES })).toEqual(OK)
    const body = decodeBody(txTonUsdt.transactions[0]!.cell)
    expect(body.name).toBe('jetton_transfer')
    expect(body.fields.amount).toBe(10_000_000_000n)
    // EQB3ncy… is STON.fi's v1 router (also returned as router_address by api.ston.fi/v1/swap/simulate).
    expect(body.fields.destination).toBe('EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt')
    expect((body.fields.forward_payload as { name: string }).name).toBe('stonfi_swap')
  })
  it('rejects messages that attach too little or far too much GRAM', () => {
    expect(checkSwapTxs(txTonUsdt.transactions, { from: NATIVE, units: 20_000_000_000n }).errors[0]).toMatch(/less GRAM/)
    expect(checkSwapTxs(txTonUsdt.transactions, { from: NATIVE, units: 1_000_000_000n }).errors[0]).toMatch(/far more/)
    expect(checkSwapTxs([], { from: NATIVE, units: 1n }).errors).toHaveLength(1)
  })
})

describe('swap.coffee messages: jetton input (split)', () => {
  const units = 250_000_000n // 250 USD₮, 6 decimals
  it('every message is a jetton_transfer from the user\'s own USD₮ wallet, summing to the amount', () => {
    expect(checkSwapTxs(txUsdtNot.transactions, { from: USDT, units, owner: OWNER, jettonWallet: USER_USDT_WALLET, dexes: USDT_DEXES })).toEqual(OK)
    const amounts = txUsdtNot.transactions.map(t => decodeBody(t.cell).fields.amount as bigint)
    expect(amounts).toEqual([114443030n, 89087379n, 46469591n])
  })
  it('flags a wrong source wallet or a larger amount', () => {
    expect(checkSwapTxs(txUsdtNot.transactions, { from: USDT, units, jettonWallet: 'EQBpY9MNLFOnwqL2A8dqMuefpgrcUDED2t2uWWPaHNibyWWu' }).errors[0]).toMatch(/own jetton wallet/)
    expect(checkSwapTxs(txUsdtNot.transactions, { from: USDT, units: 200_000_000n, jettonWallet: USER_USDT_WALLET }).errors[0]).toMatch(/not the 200000000/)
    // Unknown jetton wallet (balance not loaded): block rather than skip the check.
    expect(checkSwapTxs(txUsdtNot.transactions, { from: USDT, units, owner: OWNER, dexes: USDT_DEXES }).errors[0]).toMatch(/Could not confirm your USD₮ wallet/)
    // A GRAM-style message where a jetton transfer is expected.
    expect(checkSwapTxs(txTonUsdt.transactions.map(t => ({ ...t, cell: 'te6cckEBAQEAAgAAAEysuc0=' })), { from: USDT, units, jettonWallet: USER_USDT_WALLET }).errors.at(-1)).toMatch(/expected a jetton transfer/)
  })
  it('maps to TonConnect messages unchanged', () => {
    const m = toMessages(txUsdtNot.transactions)
    expect(m[0]).toEqual({ address: txUsdtNot.transactions[0]!.address, amount: '600000000', payload: txUsdtNot.transactions[0]!.cell })
  })
})

describe('swap output receiver (decoded per STON.fi v1/v2 and DeDust v2 TL-B)', () => {
  it('finds the receiver and refund addresses in each DEX payload', () => {
    const owner = Address.parse(OWNER)
    const t = (boc: string) => swapTargets(boc)!
    // STON.fi v1 via pTON v1 jetton_transfer: to_address + response_destination.
    expect(t(txTonUsdt.transactions[0]!.cell).dex).toBe('STON.fi v1')
    expect(t(txTonUsdt.transactions[0]!.cell).recipient!.equals(owner)).toBe(true)
    // STON.fi v2 via pTON v2 ton_transfer: receiver, refund, excesses and pTON refund all the owner.
    const v2 = t(txTonNot.transactions[0]!.cell)
    expect(v2.dex).toBe('STON.fi v2')
    expect(v2.recipient!.equals(owner)).toBe(true)
    expect(v2.returns).toHaveLength(3)
    expect(v2.returns.every(a => a.equals(owner))).toBe(true)
    // STON.fi v2 two-hop (USD₮ → GRAM → NOT): the first receiver is the next router; the final one, in custom_payload, is the owner.
    expect(t(txUsdtNot.transactions[0]!.cell).recipient!.equals(owner)).toBe(true)
    // DeDust native vault: recipient addr_none = pays the sender.
    expect(t(txTonNot.transactions[1]!.cell)).toEqual({ dex: 'DeDust', recipient: null, returns: [] })
    // DeDust jetton vault payload inside a jetton_transfer.
    expect(t(txUsdtNot.transactions[2]!.cell).dex).toBe('DeDust')
    // TONCO payload inside pTON v2: not a format we read.
    expect(swapTargets(txTon4way.transactions[1]!.cell)).toBeNull()
  })
  it('passes real routes for the owner, blocks them for anyone else, and counts unreadable messages', () => {
    expect(checkSwapTxs(txTonNot.transactions, { from: NATIVE, units: 50_000_000_000n, owner: OWNER, dexes: NATIVE_DEXES })).toEqual(OK)
    expect(checkSwapTxs(txTon4way.transactions, { from: NATIVE, units: 3_000_000_000_000n, owner: OWNER, dexes: NATIVE_DEXES })).toEqual({ errors: [], notes: [], unverified: 1 })
    const other = checkSwapTxs(txTonNot.transactions, { from: NATIVE, units: 50_000_000_000n, owner: OTHER, dexes: NATIVE_DEXES })
    expect(other.errors).toContain('A STON.fi v2 message sends the swap output to another address, not your wallet.')
    expect(other.errors).toContain('A STON.fi v2 message sends refunds or excess gas to another address, not your wallet.')
    expect(checkSwapTxs(txUsdtNot.transactions, { from: USDT, units: 250_000_000n, owner: OTHER, jettonWallet: USER_USDT_WALLET, dexes: USDT_DEXES }).errors.length).toBeGreaterThan(0)
  })
  it('blocks funds sent to a contract that is not a STON.fi router/pTON wallet or the input asset\'s DeDust vault', () => {
    // Without the contract lists nothing can be checked.
    expect(checkSwapTxs(txTonNot.transactions, { from: NATIVE, units: 50_000_000_000n, owner: OWNER }).errors).toEqual(['Could not load the STON.fi and DeDust contract addresses, so the messages cannot be checked. Try again.'])
    // GRAM input: the pTON wallet (STON.fi v2) and the native vault (DeDust) must be known.
    const noPton = checkSwapTxs(txTonNot.transactions, { from: NATIVE, units: 50_000_000_000n, owner: OWNER, dexes: { ...NATIVE_DEXES, stonfiPtonWallets: [] } })
    expect(noPton.errors).toEqual(['A STON.fi v2 message sends your funds to a contract that is not a STON.fi router or vault.'])
    const wrongVault = checkSwapTxs(txTonNot.transactions, { from: NATIVE, units: 50_000_000_000n, owner: OWNER, dexes: USDT_DEXES })
    expect(wrongVault.errors).toEqual(['A DeDust message sends your funds to a contract that is not a DeDust router or vault.'])
    // Jetton input: the jetton_transfer destination must be a STON.fi router (incl. the 2-hop intermediate receiver) / the USD₮ vault.
    const noRouters = checkSwapTxs(txUsdtNot.transactions, { from: USDT, units: 250_000_000n, owner: OWNER, jettonWallet: USER_USDT_WALLET, dexes: { ...USDT_DEXES, stonfiRouters: [] } })
    expect(noRouters.errors).toEqual(['A STON.fi v2 message sends your funds to a contract that is not a STON.fi router or vault.', 'A STON.fi v1 message sends your funds to a contract that is not a STON.fi router or vault.'])
    expect(checkSwapTxs(txUsdtNot.transactions, { from: USDT, units: 250_000_000n, owner: OWNER, jettonWallet: USER_USDT_WALLET, dexes: NATIVE_DEXES }).errors).toEqual(['A DeDust message sends your funds to a contract that is not a DeDust router or vault.'])
    // USD₮ → GRAM → NOT: hop 1 pays its GRAM to the pTON wallet of the second router (EQDx--jU…), as listed by STON.fi.
    expect(swapTargets(txUsdtNot.transactions[0]!.cell)!.via!.map(a => a.toString())).toEqual(['EQDwOyDlewGw8MkeXgZ_oOmPTIhJIlaJwhJmf4ffIPKv-294'])
    expect(routers.router_list.find(r => r.pton_wallet_address === 'EQDwOyDlewGw8MkeXgZ_oOmPTIhJIlaJwhJmf4ffIPKv-294')!.address).toBe('EQDx--jUU9PUtHltPYZX7wdzIi0SPY3KZ8nvOs0iZvQJd6Ql')
    const noHopPton = checkSwapTxs(txUsdtNot.transactions, { from: USDT, units: 250_000_000n, owner: OWNER, jettonWallet: USER_USDT_WALLET, dexes: { ...USDT_DEXES, stonfiPtonWallets: [] } })
    expect(noHopPton.errors).toEqual(['A STON.fi v2 message sends your funds to a contract that is not a STON.fi router or vault.'])
  })
  it('DeDust asset slices match what the factory accepted for get_vault_address', () => {
    expect(dedustAssetSlice(NATIVE)).toBe('te6cckEBAQEAAwAAAQiFl+L/')
    expect(dedustAssetSlice(USDT)).toBe('te6cckEBAQEAJAAAQxALETqZS1AkoWcZ9pE5Mo63WVlsOKJfWQKLFG/s3DYh3+iNJO1L')
  })
})

describe('route description', () => {
  const r = routeUsdtNot as SwapCoffeeRoute
  it('lists each split with its DEXes', () => {
    const parts = routeParts(r)
    expect(parts.map(p => p.dexes)).toEqual([['STON.fi v2', 'STON.fi v2'], ['STON.fi v1'], ['DeDust', 'DeDust']])
    expect(parts[0]!.symbols).toEqual(['USDT', 'GRAM', 'NOT'])
    expect(parts.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 6)
    expect(routeLabel(r)).toMatch(/^Split 3 ways: 46% USDT → GRAM → NOT via STON.fi v2;/)
  })
  it('transactions body forwards the paths', () => {
    expect(transactionsBody('UQ…', 0.01, r)).toEqual({ sender_address: 'UQ…', slippage: 0.01, paths: r.paths })
  })
  it('float output truncates to token decimals', () => {
    expect(floatToUnits(13.234357309608813, 6)).toBe(13234357n)
    expect(floatToUnits(636807.834887691, 9)).toBe(636807834887691n)
  })
})

describe('query params and balance', () => {
  it('parses from/to', () => {
    expect(assetParam('native')).toBe('native')
    expect(assetParam('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c')).toBe('native')
    expect(assetParam(`0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe`)).toBe(USDT.address)
    expect(assetParam('nope')).toBeNull()
    expect(assetParam(undefined)).toBeNull()
  })
  it('needs amount + gas', () => {
    expect(balanceProblem(NATIVE, 10n ** 9n, 2n * 10n ** 8n, { gram: 12n * 10n ** 8n })).toBeNull()
    expect(balanceProblem(NATIVE, 10n ** 9n, 2n * 10n ** 8n, { gram: 11n * 10n ** 8n })).toMatch(/Not enough GRAM/)
    expect(balanceProblem(USDT, 5n, 1n, { gram: 1n, jetton: 4n })).toMatch(/Not enough USD₮/)
    expect(balanceProblem(USDT, 5n, 2n, { gram: 1n, jetton: 5n })).toMatch(/for gas/)
  })
})
