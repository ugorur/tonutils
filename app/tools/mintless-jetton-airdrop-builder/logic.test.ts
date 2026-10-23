import { Address, beginCell, Cell, Dictionary, toNano } from '@ton/core'
import { Blockchain, internal } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { HMSTR_CLAIM, HMSTR_MASTER, HMSTR_MERKLE_ROOT, MINTLESS_WALLET_CODE_HASH as FIXTURE_CODE_HASH, MINTLESS_WALLET_CODE_HEX } from '~/lib/jettons-dev/fixtures'
import { airdropValue } from '~/lib/jettons-dev/mintless'
import { jettonTransferBody } from '~/utils/ton/messages'
import {
  buildAirdrop, buildApiDump, claimApiResponse, claimPayload, EXAMPLE_CSV, mintlessWalletInit, MINTLESS_WALLET_CODE_HASH,
  parseAirdropCsv, parseClaim, parseTime, proofFor
} from './logic'

const DEFAULTS = { decimals: 9, startFrom: 1_700_000_000, expireAt: 1_900_000_000 }
const addr = (i: number) => new Address(0, Buffer.from(i.toString(16).padStart(64, '0'), 'hex'))

describe('parseAirdropCsv', () => {
  it('reads the example (header, friendly + raw addresses, ISO dates)', () => {
    const { rows, errors } = parseAirdropCsv(EXAMPLE_CSV, DEFAULTS)
    expect(errors).toEqual([])
    expect(rows.map(r => r.amount)).toEqual([1500_000000000n, 250_750000000n, 42_000000000n])
    expect(rows[0]).toMatchObject({ startFrom: DEFAULTS.startFrom, expireAt: DEFAULTS.expireAt })
    expect(rows[2]).toMatchObject({ startFrom: 1793491200, expireAt: 1798761600 }) // 2026-11-01 / 2027-01-01 UTC
  })

  it('reports bad lines with their line numbers and keeps the good ones', () => {
    const csv = ['notanaddress,1', `${addr(1).toString()},1.5`, `${addr(1).toRawString()},2`, `${addr(2).toString()},0`, `${addr(3).toString()},1.1234567891`, `-1:${'00'.repeat(32)},1`, `${addr(4).toString()},1,200,100`].join('\n')
    const { rows, errors } = parseAirdropCsv(csv, DEFAULTS)
    expect(rows).toHaveLength(1)
    expect(errors.map(e => e.line)).toEqual([1, 3, 4, 5, 6, 7])
    expect(errors[1]!.message).toMatch(/duplicate of line 2/)
    expect(errors[3]!.message).toMatch(/more than 9 decimals/)
    expect(errors[4]!.message).toMatch(/workchain 0/)
    expect(errors[5]!.message).toMatch(/after start_from/)
  })

  it('parseTime: unix seconds and ISO dates (UTC)', () => {
    expect(parseTime('1722366929')).toBe(1722366929)
    expect(parseTime('2024-07-30T19:15:29Z')).toBe(1722366929)
    expect(parseTime('2024-07-30T19:15:29')).toBe(1722366929)
    expect(() => parseTime('soon')).toThrow(/unix time/)
  })
})

describe('airdrop dictionary and proofs', () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({ address: addr(i * 7919 + 1), amount: BigInt(i + 1) * 10n ** 9n, startFrom: 1000, expireAt: 2000 + i }))
  const built = buildAirdrop(rows)

  it('root = hash of storeDictDirect(Dictionary<Address, AirdropItem>), as in mintless-jetton generateTestJetton.ts', () => {
    const ref = Dictionary.empty(Dictionary.Keys.Address(), airdropValue)
    for (const r of rows) ref.set(r.address, r)
    expect(built.root).toBe(beginCell().storeDictDirect(ref).endCell().hash().toString('hex'))
    expect(built.total).toBe(45150n * 10n ** 9n)
  })

  it('proofFor is byte-identical to @ton/core Dictionary.generateMerkleProof', () => {
    for (const i of [0, 1, 150, 299]) {
      const a = rows[i]!.address
      expect(proofFor(built.cell, a).equals(built.dict.generateMerkleProof([a]))).toBe(true)
    }
    expect(() => proofFor(built.cell, addr(999_999))).toThrow(/not in the airdrop/)
  })

  it('parseClaim finds the entry in the proof the way the wallet does', () => {
    const p = parseClaim(claimPayload(proofFor(built.cell, rows[42]!.address)), rows[42]!.address)
    expect(p.root).toBe(built.root)
    expect(p.item).toEqual({ amount: 43n * 10n ** 9n, startFrom: 1000, expireAt: 2042 })
    expect(parseClaim(proofFor(built.cell, rows[42]!.address), rows[43]!.address).item).toBeNull()
  })
})

describe('jetton wallet state_init (salted, library code)', () => {
  it('reproduces the on-chain HMSTR state_init of a real claim (address 0:1F88…)', () => {
    // owner, master and merkle root are all public mainnet values; the expected state_init came with the real claim message.
    const w = mintlessWalletInit({ owner: Address.parse(HMSTR_CLAIM.owner), master: Address.parse(HMSTR_MASTER), merkleRoot: HMSTR_MERKLE_ROOT })
    expect(w.stateInit.equals(Cell.fromBase64(HMSTR_CLAIM.stateInit))).toBe(true)
    expect(w.address.toRawString().toUpperCase()).toBe(HMSTR_CLAIM.jettonWallet.toUpperCase())
    expect(MINTLESS_WALLET_CODE_HASH).toBe(FIXTURE_CODE_HASH)
    expect(Cell.fromHex(MINTLESS_WALLET_CODE_HEX).hash().toString('hex')).toBe(MINTLESS_WALLET_CODE_HASH)
  })
})

describe('end to end in @ton/sandbox with the real mintless jetton wallet code', () => {
  it('a claim built by this tool mints the airdrop on the jetton wallet', async () => {
    const chain = await Blockchain.create()
    const code = Cell.fromHex(MINTLESS_WALLET_CODE_HEX)
    const libs = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
    libs.set(BigInt('0x' + MINTLESS_WALLET_CODE_HASH), code)
    chain.libs = beginCell().storeDictDirect(libs).endCell()
    chain.now = 1500
    const owner = await chain.treasury('owner')
    const other = await chain.treasury('other')
    const master = addr(0xabc)
    const built = buildAirdrop([
      { address: owner.address, amount: toNano('100'), startFrom: 1000, expireAt: 2000 },
      { address: other.address, amount: toNano('5'), startFrom: 1000, expireAt: 2000 },
      ...Array.from({ length: 50 }, (_, i) => ({ address: addr(i + 10), amount: 1n, startFrom: 1000, expireAt: 2000 }))
    ])

    const api = claimApiResponse(built, owner.address, master)
    const send = (body: Cell) => chain.sendMessage(internal({
      from: owner.address, to: Address.parseRaw(api.jetton_wallet), value: toNano('0.15'), body, stateInit: (() => {
        const s = Cell.fromBase64(api.state_init).beginParse()
        s.loadUint(2)
        return { code: s.loadMaybeRef()!, data: s.loadMaybeRef()! }
      })()
    }))
    // Claim only: 0 jettons to yourself with the custom payload attached (what mintless-claim sends).
    const res = await send(jettonTransferBody({ amount: 0n, destination: owner.address, responseDestination: owner.address, customPayload: Cell.fromBase64(api.custom_payload) }))
    const onWallet = res.transactions.find(t => t.inMessage?.info.dest?.toString() === Address.parseRaw(api.jetton_wallet).toString())!
    expect(onWallet.description.type === 'generic' && onWallet.description.computePhase.type === 'vm' && onWallet.description.computePhase.exitCode).toBe(0)

    const data = await chain.runGetMethod(Address.parseRaw(api.jetton_wallet), 'get_wallet_data')
    expect(data.stackReader.readBigNumber()).toBe(toNano('100'))
    expect((await chain.runGetMethod(Address.parseRaw(api.jetton_wallet), 'is_claimed')).stackReader.readNumber()).not.toBe(0)

    // A second claim fails with error::airdrop_already_claimed (54).
    const again = await send(jettonTransferBody({ amount: 0n, destination: owner.address, responseDestination: owner.address, customPayload: Cell.fromBase64(api.custom_payload) }))
    const tx = again.transactions.find(t => t.inMessage?.info.dest?.toString() === Address.parseRaw(api.jetton_wallet).toString())!
    expect(tx.description.type === 'generic' && tx.description.computePhase.type === 'vm' && tx.description.computePhase.exitCode).toBe(54)
  }, 60_000)

  it('buildApiDump answers for every owner', async () => {
    const built = buildAirdrop(Array.from({ length: 30 }, (_, i) => ({ address: addr(i + 1), amount: 1n, startFrom: 1, expireAt: 2 })))
    let last = 0
    const dump = await buildApiDump(built, addr(5), undefined, d => (last = d), 7)
    expect(Object.keys(dump)).toHaveLength(30)
    expect(last).toBe(30)
    expect(dump[addr(3).toRawString()]!.compressed_info).toEqual({ amount: '1', start_from: '1', expired_at: '2' })
  })
})
