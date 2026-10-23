import { Address, beginCell, Cell, toNano } from '@ton/core'
import { Blockchain, createShardAccount, internal } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { ITEM_CODE_B64 } from '~/lib/nfts-write/getgems'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import { decodeBody } from '~/utils/ton/messages'
import fixtures from './fixtures.json'
import { cancelBody, cancelMessages, classifyListing, feeSplit, parseSaleData, repriceBody, SALE_KINDS } from './logic'

// fixtures.json: live mainnet sale contracts (code + data + balance) and the NFTs they hold, see its _source.
type Fx = (typeof fixtures.sales)['v3r3']
const SALES = fixtures.sales as Record<'v2' | 'v3' | 'v3r2' | 'v3r3' | 'v4r1', Fx>

async function load(fx: Fx) {
  const bc = await Blockchain.create()
  bc.now = Math.floor(Date.now() / 1000)
  const sale = Address.parse(fx.sale)
  const nft = Address.parse(fx.nft)
  await bc.setShardAccount(sale, createShardAccount({ address: sale, code: Cell.fromBase64(fx.code), data: Cell.fromBase64(fx.data), balance: BigInt(fx.balance) }))
  await bc.setShardAccount(nft, createShardAccount({ address: nft, code: Cell.fromBase64(ITEM_CODE_B64), data: Cell.fromBase64(fx.nftData), balance: BigInt(fx.nftBalance) }))
  return { bc, sale, nft, owner: Address.parse(fx.owner) }
}

const exitOf = (tx: { description: unknown }) => {
  const d = tx.description as { computePhase?: { type: string, exitCode?: number, success?: boolean } }
  return d.computePhase?.type === 'vm' ? d.computePhase.exitCode : 'skipped'
}

describe('sale data', () => {
  it('every fixture is a known sale contract and parses to tonapi\'s owner, NFT and price', () => {
    for (const [v, fx] of Object.entries(SALES)) {
      const kind = SALE_KINDS[fx.codeHash]
      expect(kind?.version).toBe(v)
      const s = parseSaleData(kind!.version, Cell.fromBase64(fx.data))
      expect(s.isComplete).toBe(false)
      expect(s.nft.equals(Address.parse(fx.nft))).toBe(true)
      expect(s.owner!.equals(Address.parse(fx.owner))).toBe(true)
      expect(s.price.toString()).toBe(fx.price)
    }
  })

  it('agrees with the contract\'s own get_fix_price_data (v3r3) and get_fix_price_data_v4 (v4r1)', async () => {
    let { bc, sale } = await load(SALES.v3r3)
    let r = (await bc.runGetMethod(sale, 'get_fix_price_data')).stackReader
    const s3 = parseSaleData('v3r3', Cell.fromBase64(SALES.v3r3.data))
    r.skip(5)
    expect(r.readBigNumber()).toBe(s3.price)
    r.skip(1)
    expect(r.readBigNumber()).toBe(s3.marketplaceFee)
    r.skip(1)
    expect(r.readBigNumber()).toBe(s3.royaltyAmount)

    ;({ bc, sale } = await load(SALES.v4r1))
    r = (await bc.runGetMethod(sale, 'get_fix_price_data_v4')).stackReader
    const s4 = parseSaleData('v4r1', Cell.fromBase64(SALES.v4r1.data))
    r.skip(5)
    expect(r.readBigNumber()).toBe(s4.price)
    r.skip(1)
    expect(r.readNumber()).toBe(s4.feePercent)
    r.skip(1)
    expect(r.readNumber()).toBe(s4.royaltyPercent)
  })
})

describe('cancel in @ton/sandbox against the live contracts', () => {
  for (const v of ['v2', 'v3', 'v3r2', 'v3r3', 'v4r1'] as const) {
    it(`${v}: the seller gets the NFT back`, async () => {
      const fx = SALES[v]
      const { bc, sale, nft, owner } = await load(fx)
      const listing = classifyListing({ address: fx.nft, sale: { address: fx.sale } } as TonapiNft, fx.codeHash, fx.data, owner)
      expect(listing.status).toBe('ready')
      const [msg] = cancelMessages([listing])
      expect(Address.parse(msg!.address).equals(sale)).toBe(true)
      const body = decodeBody(msg!.payload)
      if (v === 'v2' || v === 'v3') expect([body.op, body.name]).toEqual([3, 'unknown']) // op 3 + query_id only
      else expect([body.name, body.fields.text]).toEqual(['text_comment', 'cancel'])
      const res = await bc.sendMessage(internal({ from: owner, to: sale, value: msg!.amount, body: msg!.payload }))
      const saleTx = res.transactions.find(t => t.inMessage?.info.dest?.toString() === sale.toString())!
      expect(exitOf(saleTx)).toBe(0)
      const d = (await bc.runGetMethod(nft, 'get_nft_data')).stackReader
      d.skip(3)
      expect(d.readAddress().equals(owner)).toBe(true)
    })
  }

  it('v3r3 also accepts op 3 (the form the v2/v3 contracts need)', async () => {
    const { bc, sale, owner } = await load(SALES.v3r3)
    const res = await bc.sendMessage(internal({ from: owner, to: sale, value: toNano('0.1'), body: cancelBody('v2') }))
    expect(exitOf(res.transactions[0]!)).toBe(0)
  })

  it('v3r3: less than the minimum value fails with 457, a stranger with 458', async () => {
    const { bc, sale } = await load(SALES.v3r3)
    const owner = Address.parse(SALES.v3r3.owner)
    let res = await bc.sendMessage(internal({ from: owner, to: sale, value: toNano('0.09'), body: cancelBody('v3r3') }))
    expect(exitOf(res.transactions[0]!)).toBe(457)
    const stranger = Address.parse('EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir')
    res = await bc.sendMessage(internal({ from: stranger, to: sale, value: toNano('0.1'), body: cancelBody('v3r3') }))
    expect(exitOf(res.transactions[0]!)).toBe(458)
  })
})

describe('reprice in @ton/sandbox', () => {
  it('v3r3: price changes and fees keep their percentages', async () => {
    const { bc, sale, owner } = await load(SALES.v3r3)
    const state = parseSaleData('v3r3', Cell.fromBase64(SALES.v3r3.data))
    const newPrice = state.price * 2n
    const res = await bc.sendMessage(internal({ from: owner, to: sale, value: toNano('0.05'), body: repriceBody(state, newPrice) }))
    expect(exitOf(res.transactions[0]!)).toBe(0)
    const r = (await bc.runGetMethod(sale, 'get_fix_price_data')).stackReader
    r.skip(5)
    expect(r.readBigNumber()).toBe(newPrice)
    r.skip(1)
    expect(r.readBigNumber()).toBe(state.marketplaceFee! * 2n)
    r.skip(1)
    expect(r.readBigNumber()).toBe(state.royaltyAmount! * 2n)
    expect(feeSplit(state, newPrice).fee).toBe(state.marketplaceFee! * 2n)
  })

  it('v4r1: price changes, jetton prices are kept', async () => {
    const { bc, sale, owner } = await load(SALES.v4r1)
    const state = parseSaleData('v4r1', Cell.fromBase64(SALES.v4r1.data))
    const res = await bc.sendMessage(internal({ from: owner, to: sale, value: toNano('0.05'), body: repriceBody(state, toNano('123')) }))
    expect(exitOf(res.transactions[0]!)).toBe(0)
    const after = parseSaleData('v4r1', (await bc.getContract(sale)).accountState!.type === 'active' ? ((await bc.getContract(sale)).accountState as { state: { data: Cell } }).state.data : beginCell().endCell())
    expect(after.price).toBe(toNano('123'))
    expect(after.jettonPrices?.hash().toString('hex') ?? null).toBe(state.jettonPrices?.hash().toString('hex') ?? null)
  })

  it('refuses versions without a price-change op', () => {
    const state = parseSaleData('v2', Cell.fromBase64(SALES.v2.data))
    expect(() => repriceBody(state, 1n)).toThrow(/cannot change price/)
  })
})

describe('classifyListing', () => {
  const fx = SALES.v3r3
  const nft = { address: fx.nft, sale: { address: fx.sale } } as TonapiNft
  it('someone else\'s sale is not cancellable', () => {
    expect(classifyListing(nft, fx.codeHash, fx.data, Address.parse('EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir')).status).toBe('not-yours')
  })
  it('auctions and unknown code are not touched', () => {
    expect(classifyListing(nft, 'ZmiHL6eXBUQ//UdSPo6eqfdquZ+aC1nSfej4GhwnudQ=', undefined, Address.parse(fx.owner)).status).toBe('auction')
    expect(classifyListing(nft, 'xxx', undefined, Address.parse(fx.owner)).status).toBe('unknown-contract')
  })
})
