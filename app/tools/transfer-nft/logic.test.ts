import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildNftTransfer, isSbt, toOwnedNft, transferNotes } from './logic'

// Real mainnet NFT transfers (toncenter v3 /nft/transfers + /transactions?hash=…, read 2026-10-22).
// Both: forward_amount 1, response_destination = old owner; body = in_msg of the NFT item tx.
const TRANSFERS = [
  {
    tx: 'ceurRDzIAC+VT+R5TeZRRoqfyBeUPUJT9zyteAy7dqc=',
    item: '0:BAED8BA08AB1EF2ABC0150636DFBFC150E932A40123A1E41DFFE73D190A82489',
    owner: '0:B2D58633031FE075DA98A0BEB0C1C914D62B1A3342FAAC949A197EC182DB57DE',
    newOwner: '0:96B2466E9CC9CB7783C816BB0EA4A663355809E0E7E96E93B1B4DF74F7F307FC',
    queryId: 0n,
    comment: '',
    body: 'te6cckEBAQEAUwAAoV/MPRQAAAAAAAAAAIAS1kjN05k5bvB5Atdh1JTMZqsBPBz9LdJ2Npvunv5g/5ACy1YYzAx/gddqYoL6wwckU1isaM0L6rJSaGX7BgttX3ggKDPbPSs='
  },
  {
    tx: 'w+rQLsgH905sSVabazN8AVwMlKaZ3Uowk9lpoAamIi0=',
    item: '0:CEE5212193267E3E3BFD1B67928DDDF8B8CEEEB6F836AD167A15879F2CFEAC3A',
    owner: '0:5278BAB60B48B4C23A2F66DC2D37E5B7AF42DBF2E6F44BAF9E0A856A5FDC9AA2',
    newOwner: '0:158136239ADB15DD59DF90C641F9EFD312CFEB8664F218F4C3E5FCE9D95E6C07',
    queryId: 4734915539902100632n,
    comment: 'Ref#LWxhyfeQB',
    body: 'te6cckEBAgEAZwABoV/MPRRBtcyYzVd0mIACsCbEc1tiu6s78hjIPz36Yln9cMyeQx6YfL+dOyvNgPABSeLq2C0i0wjovZtwtN+W3r0Lb8ub0S6+eCoVqX9yaoggOAEAIgAAAABSZWYjTFd4aHlmZVFCSpGPVw=='
  }
]

describe('buildNftTransfer reproduces real transfers bit for bit', () => {
  for (const v of TRANSFERS) {
    it(`tx ${v.tx}`, () => {
      const m = buildNftTransfer({ item: v.item, owner: Address.parse(v.owner), newOwner: Address.parse(v.newOwner), comment: v.comment, queryId: v.queryId })
      expect(m.address).toBe(v.item)
      expect(m.amount).toBe(50_000_000n)
      expect((m.payload as Cell).hash().toString('hex')).toBe(Cell.fromBase64(v.body).hash().toString('hex'))
    })
  }
})

describe('NFT list (tonapi /v2/accounts/{id}/nfts, TON Foundation, 2026-10-22)', () => {
  it('recognises .ton domains, Telegram usernames and spam', () => {
    const domain = toOwnedNft({
      address: '0:6239C21F3964E2844B0B2DFAEC710FD97409839329AEC47251C4033B7080F566',
      collection: { address: '0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf', name: 'TON DNS Domains' },
      metadata: { name: 'mygoldtonnft.ton' },
      dns: 'mygoldtonnft.ton',
      trust: 'whitelist'
    })
    expect(domain).toMatchObject({ address: '0:6239c21f3964e2844b0b2dfaec710fd97409839329aec47251c4033b7080f566', name: 'mygoldtonnft.ton', kind: 'domain', trust: 'whitelist' })
    // Collection address from tonapi /v2/nfts/collections/EQCA14o1-…: "Telegram Usernames".
    expect(toOwnedNft({ address: '0:1', collection: { address: '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2' }, metadata: { name: '@example' } }).kind).toBe('username')
    expect(toOwnedNft({ address: '0:2', index: 7 }).name).toBe('#7')
  })
})

describe('transfer checks', () => {
  // toncenter v3 /addressBook interfaces: TON Learn SBT item vs a TON DNS item (mainnet, 2026-10-22).
  const sbt = { address: '0:aeff06c02b63a5deb2e0ef2a96798b8c72bd1f1abd0697403768857dcb0a408a', name: 'TON Learn SBT', collection: 'TON Learn SBT', trust: 'none', kind: 'nft' as const }
  const dom = { address: '0:6239c21f3964e2844b0b2dfaec710fd97409839329aec47251c4033b7080f566', name: 'mygoldtonnft.ton', collection: 'TON DNS Domains', trust: 'whitelist', kind: 'domain' as const }
  const ifaces = { [sbt.address]: ['nft_item', 'sbt'], [dom.address]: ['dns', 'editable', 'nft_item'] }
  it('blocks soulbound tokens', () => {
    expect(isSbt(ifaces[sbt.address])).toBe(true)
    expect(isSbt(ifaces[dom.address])).toBe(false)
    expect(transferNotes([sbt], ifaces, 10n ** 9n).map(n => n.level)).toEqual(['error'])
  })
  it('explains domains and checks fee money per item', () => {
    expect(transferNotes([dom], ifaces, 10n ** 9n).map(n => n.level)).toEqual(['info'])
    expect(transferNotes([dom, { ...dom, address: '0:3' }], ifaces, 60_000_000n).map(n => n.level)).toEqual(['info', 'error'])
  })
})
