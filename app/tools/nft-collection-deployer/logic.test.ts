import { Address, beginCell, Cell, toNano, TupleBuilder } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { decodeContent, offchainContent, snakeText } from '~/lib/nfts-write/content'
import { COLLECTION_CODE_HASH, ITEM_CODE_HASH } from '~/lib/nfts-write/getgems'
import {
  batchMintBody, changeOwnerBody, COLLECTION_CODE, collectionData, collectionStateInit, editContentBody, ITEM_AMOUNT, ITEM_CODE,
  itemAddress, MAX_BATCH, mintBody, mintMessages, mintMessageValue, numberedList, parseMintList
} from './logic'

// TON Diamonds (EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir) runs the same getgems code. Values read from
// toncenter v3 on 2026-10-22: /nft/collections (owner, next_item_index, collection_content.uri, data_hash, code_hash),
// runGetMethod royalty_params, get_nft_content(11, "11/11.json") and /nft/items for item #11.
const DIAMONDS = {
  address: 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir',
  owner: '0:EC3F88ECF97D55552EE605902EA1E5EF29CBCE625929B1D10B047C0939ECF4ED',
  next: 10000n,
  uri: 'https://nft.ton.diamonds/diamonds.json',
  common: 'https://nft.ton.diamonds/nft/',
  /** royalty_params() = (22, 1000, destination); the destination slice as toncenter returns it. */
  royaltyDest: 'te6cckEBAQEAJAAAQ4ARKckLuq22GdsiptP7thQNN+yRFCi1BGWZHcyFbaVcf5B/CukY',
  dataHash: '92bzv+XAr6JX2UDL5F4CspDiOOg37jGlCSk4P2C7Xxc=',
  item11: '0:ECB48C17E9943DFB9ED603D74D06D4320CF5E273EFC0290385C13A2DDFB0E5E8'
}

describe('code', () => {
  it('collection and item code match the live getgems hashes', () => {
    expect(COLLECTION_CODE.hash().toString('base64')).toBe(COLLECTION_CODE_HASH)
    expect(ITEM_CODE.hash().toString('base64')).toBe(ITEM_CODE_HASH)
  })
})

describe('collection data layout', () => {
  it('rebuilds the TON Diamonds storage cell bit for bit (same data_hash as on chain)', () => {
    const royalty = { numerator: 22, denominator: 1000, destination: Cell.fromBase64(DIAMONDS.royaltyDest).beginParse().loadAddress() }
    const data = collectionData({
      owner: Address.parse(DIAMONDS.owner),
      content: offchainContent(DIAMONDS.uri),
      commonContent: DIAMONDS.common,
      royalty,
      nextItemIndex: DIAMONDS.next
    })
    expect(data.hash().toString('base64')).toBe(DIAMONDS.dataHash)
  })

  it('derives item #11 of TON Diamonds at its on-chain address', () => {
    expect(itemAddress(Address.parse(DIAMONDS.address), 11n).toRawString().toUpperCase()).toBe(DIAMONDS.item11)
  })
})

describe('parseMintList', () => {
  const me = Address.parse(DIAMONDS.owner)
  it('assigns consecutive indexes and optional owners', () => {
    const r = parseMintList('0.json\n# comment\n\n1.json, EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir', me, 5n)
    expect(r.errors).toEqual([])
    expect(r.items.map(i => [i.index, i.content])).toEqual([[5n, '0.json'], [6n, '1.json']])
    expect(r.items[0]!.owner.equals(me)).toBe(true)
    expect(r.items[1]!.owner.equals(Address.parse(DIAMONDS.address))).toBe(true)
  })
  it('reports bad lines', () => {
    const r = parseMintList('a.json, nope\n, x\na,b,c', me, 0n)
    expect(r.errors).toHaveLength(3)
    expect(r.items).toHaveLength(0)
  })
  it('numbers suffixes', () => {
    expect(numberedList(3n, 3)).toBe('3.json\n4.json\n5.json')
  })
})

describe('message values', () => {
  it('splits big mints into MAX_BATCH-item messages', () => {
    const me = Address.parse(DIAMONDS.owner)
    const { items } = parseMintList(numberedList(0n, 250), me, 0n)
    const msgs = mintMessages('EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir', items)
    expect(msgs).toHaveLength(3)
    expect(msgs[0]!.amount).toBe(mintMessageValue(items.slice(0, MAX_BATCH)))
    expect(() => batchMintBody(items)).toThrow()
  })
})

// Runs the real contract code in the TON sandbox emulator: deploy, mint, batch mint, edit, change owner.
describe('end to end in @ton/sandbox', () => {
  it('deploys, mints and manages a collection with these exact messages', async () => {
    const bc = await Blockchain.create()
    const owner = await bc.treasury('owner')
    const other = await bc.treasury('other')
    const params = {
      owner: owner.address,
      content: offchainContent('https://example.com/collection.json'),
      commonContent: 'https://example.com/nft/',
      royalty: { numerator: 50, denominator: 1000, destination: owner.address }
    }
    const { stateInit, address, init } = collectionStateInit(params)
    expect(stateInit.refs).toHaveLength(2)

    const dep = await owner.send({ to: address, value: toNano('0.05'), init, body: beginCell().endCell(), bounce: false })
    expect(dep.transactions.some(t => t.inMessage?.info.dest?.toString() === address.toString() && t.description.type === 'generic' && t.description.computePhase.type === 'vm' && t.description.computePhase.success)).toBe(true)

    const get = async (method: string, args?: TupleBuilder) => (await bc.runGetMethod(address, method, args?.build() ?? [])).stackReader
    let r = await get('get_collection_data')
    expect(r.readBigNumber()).toBe(0n)
    expect(decodeContent(r.readCell())).toEqual({ kind: 'offchain', uri: 'https://example.com/collection.json' })
    expect(r.readAddress().equals(owner.address)).toBe(true)
    r = await get('royalty_params')
    expect([r.readNumber(), r.readNumber()]).toEqual([50, 1000])

    // single mint (op 1)
    const { items } = parseMintList('0.json\n1.json\n2.json', owner.address, 0n)
    const [single] = mintMessages(address.toString(), items.slice(0, 1))
    const before = (await bc.getContract(address)).balance
    let res = await owner.send({ to: address, value: single!.amount, body: single!.payload })
    const item0 = itemAddress(address, 0n)
    expect(res.transactions.find(t => t.inMessage?.info.dest?.toString() === item0.toString())).toBeTruthy()

    // batch mint (op 2) of items 1 and 2, item 2 for someone else
    const batch = parseMintList('1.json\n2.json, ' + other.address.toString(), owner.address, 1n).items
    const [bm] = mintMessages(address.toString(), batch)
    res = await owner.send({ to: address, value: bm!.amount, body: bm!.payload })
    r = await get('get_collection_data')
    expect(r.readBigNumber()).toBe(3n)

    // collection never ends up poorer than before the mints: our fees cover its costs
    expect((await bc.getContract(address)).balance).toBeGreaterThanOrEqual(before)

    for (const [i, who] of [[0n, owner.address], [2n, other.address]] as const) {
      const a = itemAddress(address, i)
      const tb = new TupleBuilder()
      tb.writeNumber(i)
      expect((await get('get_nft_address_by_index', tb)).readAddress().equals(a)).toBe(true)
      const d = (await bc.runGetMethod(a, 'get_nft_data')).stackReader
      expect(d.readBoolean()).toBe(true)
      expect(d.readBigNumber()).toBe(i)
      expect(d.readAddress().equals(address)).toBe(true)
      expect(d.readAddress().equals(who)).toBe(true)
      const individual = d.readCell()
      expect(snakeText(individual)).toBe(`${i}.json`)
      expect((await bc.getContract(a)).balance).toBeGreaterThan(ITEM_AMOUNT - toNano('0.01'))
      const cb = new TupleBuilder()
      cb.writeNumber(i)
      cb.writeCell(individual)
      const full = decodeContent((await get('get_nft_content', cb)).readCell())
      expect(full).toEqual({ kind: 'offchain', uri: `https://example.com/nft/${i}.json` })
    }

    // mint body for the next index is accepted, a skipped index is rejected (402)
    const bad = mintBody({ index: 10n, owner: owner.address, content: 'x', amount: ITEM_AMOUNT })
    res = await owner.send({ to: address, value: toNano('0.1'), body: bad })
    const badTx = res.transactions.find(t => t.inMessage?.info.dest?.toString() === address.toString())!
    expect(badTx.description.type === 'generic' && badTx.description.computePhase.type === 'vm' && badTx.description.computePhase.exitCode).toBe(402)

    // edit content (op 4)
    await owner.send({ to: address, value: toNano('0.02'), body: editContentBody(offchainContent('ipfs://new'), 'ipfs://items/', { numerator: 1, denominator: 100, destination: other.address }) })
    r = await get('get_collection_data')
    r.readBigNumber()
    expect(decodeContent(r.readCell())).toEqual({ kind: 'offchain', uri: 'ipfs://new' })
    r = await get('royalty_params')
    expect([r.readNumber(), r.readNumber()]).toEqual([1, 100])
    expect(r.readAddress().equals(other.address)).toBe(true)

    // only the owner may mint: a stranger gets 401
    res = await other.send({ to: address, value: toNano('0.1'), body: mintBody({ index: 3n, owner: other.address, content: 'x', amount: ITEM_AMOUNT }) })
    const strangerTx = res.transactions.find(t => t.inMessage?.info.dest?.toString() === address.toString())!
    expect(strangerTx.description.type === 'generic' && strangerTx.description.computePhase.type === 'vm' && strangerTx.description.computePhase.exitCode).toBe(401)

    // change owner (op 3)
    await owner.send({ to: address, value: toNano('0.02'), body: changeOwnerBody(other.address) })
    r = await get('get_collection_data')
    r.readBigNumber()
    r.readCell()
    expect(r.readAddress().equals(other.address)).toBe(true)
  }, 60_000)

  it('a full MAX_BATCH batch fits the 1M gas limit', async () => {
    const bc = await Blockchain.create()
    const owner = await bc.treasury('owner', { balance: toNano('1000') })
    const { address, init } = collectionStateInit({
      owner: owner.address,
      content: offchainContent('https://example.com/c.json'),
      commonContent: 'https://example.com/nft/',
      royalty: { numerator: 0, denominator: 1000, destination: owner.address }
    })
    await owner.send({ to: address, value: toNano('0.05'), init, bounce: false })
    const { items } = parseMintList(numberedList(0n, MAX_BATCH), owner.address, 0n)
    const [m] = mintMessages(address.toString(), items)
    const before = (await bc.getContract(address)).balance
    const res = await owner.send({ to: address, value: m!.amount, body: m!.payload })
    const tx = res.transactions.find(t => t.inMessage?.info.dest?.toString() === address.toString())!
    expect(tx.description.type === 'generic' && tx.description.computePhase.type === 'vm' && tx.description.computePhase.success).toBe(true)
    const r = (await bc.runGetMethod(address, 'get_collection_data')).stackReader
    expect(r.readBigNumber()).toBe(BigInt(MAX_BATCH))
    const lastItem = await bc.getContract(itemAddress(address, BigInt(MAX_BATCH - 1)))
    expect(lastItem.accountState?.type).toBe('active')
    // the collection's own balance does not shrink: PER_ITEM_FEE covers gas + forwarding
    expect((await bc.getContract(address)).balance).toBeGreaterThanOrEqual(before)
  }, 120_000)
})
