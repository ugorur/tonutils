import { Address, Cell, parseTuple, TupleReader } from '@ton/core'
import { describe, expect, it } from 'vitest'
import listing from '../nft-listing-manager/fixtures.json'
import { ITEM_CODE_B64 } from '~/lib/nfts-write/getgems'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import { sandboxHandlers } from '~/utils/lazy/sandbox.worker'
import { decodeBody } from '~/utils/ton/messages'
import fixtures from './fixtures.json'
import { BURN_ADDRESS, burnMessage, checkBurn, classifyNft, type Emulator, judgeBurn, TRANSFER_AMOUNT } from './logic'

// fixtures.json: a real wallet's NFTs from tonapi and the on-chain state of six blacklisted ones (see _source).
const OWNER = Address.parse(fixtures.owner)
const items = fixtures.items as unknown as TonapiNft[]

// The same handlers the browser's sandbox worker runs (see ~/utils/lazy/workers.test.ts), adapted to loadSandbox()'s shape.
const emu: Emulator = {
  runTransaction: a => sandboxHandlers.runTransaction(a) as ReturnType<Emulator['runTransaction']>,
  async runGetMethod(a) {
    const res = await sandboxHandlers.runGetMethod({ code: a.code.toBoc().toString('base64'), data: a.data.toBoc().toString('base64'), address: a.address.toRawString(), method: a.method, balance: (a.balance ?? 0n).toString() })
    if (!res.output.success) throw new Error(res.output.error)
    return { exitCode: res.output.vm_exit_code, reader: new TupleReader(parseTuple(Cell.fromBase64(res.output.stack))) }
  }
}

describe('classifyNft', () => {
  it('uses tonapi trust, then text heuristics', () => {
    const count: Record<string, number> = {}
    for (const n of items) count[classifyNft(n).cls] = (count[classifyNft(n).cls] ?? 0) + 1
    // tonapi said: 36 blacklist, 6 whitelist, 18 graylist, 40 none
    expect(count.scam).toBe(36)
    expect(count.trusted).toBeGreaterThanOrEqual(6)
    const byName = (name: string) => classifyNft(items.find(n => n.metadata.name === name)!).cls
    expect(byName('1,000,000 $DOGS voucher')).toBe('scam')
    expect(byName('Surge Board #12691')).toBe('trusted')
    // trust "none" but an obvious fake voucher
    expect(items.filter(n => n.metadata.name === '1,000,000 NOT Voucher #5123').map(n => classifyNft(n).cls)).toContain('suspicious')
    expect(byName('Gram Reward #377')).toBe('suspicious')
    expect(byName('Cat #1')).toBe('unverified')
    // legit unverified NFTs the text checks must not flag: a TON Society event trophy, a game NFT whose text says "Claimy"
    expect(byName('TON Smart Challenge #2 Winners Trophy')).toBe('unverified')
    expect(byName('Ton Tiger #5181')).toBe('unverified')
    expect(byName('TON Punk #2585')).toBe('unverified')
  })
})

describe('burnMessage', () => {
  it('is a TEP-62 transfer to the zero address with the excess back to the owner', () => {
    const m = burnMessage(items[0]!.address, OWNER)
    expect(m.amount).toBe(TRANSFER_AMOUNT)
    const d = decodeBody(m.payload)
    expect(d.name).toBe('nft_transfer')
    expect(Address.parse(d.fields.new_owner as string).equals(BURN_ADDRESS)).toBe(true)
    expect(Address.parse(d.fields.response_destination as string).equals(OWNER)).toBe(true)
    expect(d.fields.forward_amount).toBe(0n)
    expect(BURN_ADDRESS.toString({ bounceable: false })).toBe('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ')
  })
})

describe('checkBurn (emulated against real contracts)', () => {
  it('a standard getgems item moves to the burn address and returns the excess', async () => {
    const fx = listing.sales.v3r3 // TON Diamonds item held by its sale contract
    const v = await checkBurn(emu, { address: fx.nft, code: ITEM_CODE_B64, data: fx.nftData, balance: fx.nftBalance }, Address.parse(fx.sale))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.cost).toBeLessThan(10_000_000n)
  })

  it('a standard item below its 0.05 storage reserve keeps the top-up and still counts as burnable', async () => {
    const fx = fixtures.lowBalanceItem
    expect(fx.codeHash).toBe('TJEjgoaC+m9DeXq0FzK8qJDK4Bdm4GdBACUFFuC/jUI=') // getgems nft-item
    const v = await checkBurn(emu, fx, OWNER)
    expect(v.ok).toBe(true)
    // it keeps about 0.05 - balance for storage, the rest comes back
    if (v.ok) expect(v.cost).toBeGreaterThanOrEqual(50_000_000n - BigInt(fx.balance))
  })

  it('value forwarded to a third party is a trap even when the NFT moves', () => {
    const moved = { success: true, aborted: false, exitCode: 0, refund: 0n, leaked: 45_000_000n, code: null, data: null }
    expect(judgeBurn(moved, BURN_ADDRESS, 1000n)).toMatchObject({ ok: false, why: 'keeps-funds' })
    expect(judgeBurn({ ...moved, leaked: 0n }, BURN_ADDRESS, 1000n).ok).toBe(true) // stays in the item: storage top-up
    expect(judgeBurn({ ...moved, leaked: 0n }, BURN_ADDRESS, 50_000_000n)).toMatchObject({ ok: false, why: 'keeps-funds' })
  })

  it('real spam NFTs are traps: they refuse, keep the GRAM, or cannot be emulated', async () => {
    const verdicts: Record<string, string> = {}
    for (const s of fixtures.states) {
      const v = await checkBurn(emu, s, OWNER)
      expect(v.ok).toBe(false)
      verdicts[s.codeHash] = v.ok ? 'ok' : v.why
    }
    expect(verdicts['3WdEkCF234cXBtdq1r8XwzidVtpoqbEgC7xhYOHYpVY=']).toBe('refuses') // throws 0xffff, value bounces
    expect(verdicts['MosjQ9xHXfFhNzwWMOa6eNHNdbJbn7OMuJarWQJarQo=']).toBe('keeps-funds') // "accepts", keeps ~0.05, owner unchanged
    expect(verdicts['4gEznB2psyLtT/YonLrXHfwwNBfMZvuvrnBS+n2mZXI=']).toBe('keeps-funds')
    expect(verdicts['5nxwgWEExrRUTUXsW6lBQ+Q+m6ZHDlqXUKAAHx6aZ74=']).toBe('error')
  }, 60_000)
})
