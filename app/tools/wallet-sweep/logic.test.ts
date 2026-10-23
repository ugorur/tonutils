import { Address, type Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import type { TonapiJettonBalance } from '~/lib/wallet-actions/core'
import { toOwnedJetton } from '~/lib/wallet-actions/core'
import { parseBoc } from '~/utils/ton/messages'
import type { TonapiNft } from './logic'
import { assetGas, buildAssetMessages, buildGramSweep, SWEEP_RESERVE, selectJettons, selectNfts, toOwnedNft } from './logic'

// Independent source: tonapi's own wallet migration builder. POST /v2/migration/prepare
// { from: 0:1bf8102f…3be2 (v4R2), to: 0:83dfd552…31a8 } on 2026-10-22 returned these internal messages
// (decoded from the returned BOCs): NFTs first, then jettons; spam and empty balances left out.
const TARGET = Address.parse('0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8')
const TONAPI_MIGRATION = [
  { dest: '0:00d1465c779d9a62eb72dcee0e3dd18bd27563e4155bb04642b93d585f54556f', value: 60_000_000n, qid: 1792700263456434933n, body: 'te6cckEBAQEAUwAAoV/MPRQY4PNkOBHq9YAQe/qqXMblNo5fl5kYi9eYzSLgSrFtHY6k/DdIB0HmNRACD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqAgKLbPlFQ=' },
  { dest: '0:f9c832fc36bf111fbb5c5ae2ffcde2b7f11b23f057639890c828c2ffe337eade', value: 60_000_000n, qid: 1792700263458519630n, body: 'te6cckEBAQEAUwAAoV/MPRQY4PNkODG6ToAQe/qqXMblNo5fl5kYi9eYzSLgSrFtHY6k/DdIB0HmNRACD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqAgKD5PV1g=' },
  { dest: '0:aeddc3beb9e8a56788d4ad0ea2b1543bab2a4fae926be60e9363942361301ab1', value: 50_000_000n, qid: 1792700263462390228n, body: 'te6cckEBAQEAVgAAqA+KfqUY4PNkOGzJ1DCOeigBB7+qpcxuU2jl+XmRiL15jNIuBKsW0djqT8N0gHQeY1EAIPf1VLmNym0cvy8yMRevMZpFwJVi2jsdSfhukA6DzGoCAuGfko0=' },
  { dest: '0:378a609f092b60ec51acb00bdb8473080eca4b931655cfcc1a1564f661b2ed01', value: 50_000_000n, qid: 1792700263462414708n, body: 'te6cckEBAQEAVAAApA+KfqUY4PNkOG0pdBAYAQe/qqXMblNo5fl5kYi9eYzSLgSrFtHY6k/DdIB0HmNRACD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqAgIUYERH' },
  { dest: '0:68a748179d99e16d3d4bfd56a6f8ede799b060aff441143b40a1ba4705784985', value: 50_000_000n, qid: 1792700263462427317n, body: 'te6cckEBAQEAWQAArg+KfqUY4PNkOG1atWiGyYt2AAgBB7+qpcxuU2jl+XmRiL15jNIuBKsW0djqT8N0gHQeY1EAIPf1VLmNym0cvy8yMRevMZpFwJVi2jsdSfhukA6DzGoCAoajUME=' }
]

// The same wallet's assets from tonapi /v2/accounts/0:1bf8…3be2/nfts?indirect_ownership=false and /jettons (2026-10-22, trimmed).
const NFTS: TonapiNft[] = [
  { address: '0:64d86a8d10faf1cb76a6200c86e5b1cc20117f90c6061a7ed7b7bfe18987cd26', index: 1426223229886, trust: 'blacklist', dns: null, metadata: { name: '💎 Yᴏᴜ ᴡᴏɴ 100 ᴛᴏɴ on stonspin܂com' } },
  { address: '0:36d36934135cd1e61c6903d2b9df560bd218453c1d7ff9a5edfe9a5c4a5f2af6', index: 0, trust: 'blacklist', dns: null, metadata: {} },
  { address: '0:00d1465c779d9a62eb72dcee0e3dd18bd27563e4155bb04642b93d585f54556f', index: 576724705128922385, trust: 'whitelist', dns: 'jusaninvest.ton', collection: { address: '0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf', name: 'TON DNS Domains' }, metadata: { name: 'jusaninvest.ton' } },
  { address: '0:f7603137f6974c337aa710c1b12c88d83565011787d82a6860c38430c284d355', index: 0, trust: 'blacklist', dns: null, metadata: { name: '✅ Yᴏᴜ ᴡᴏɴ 80 tᴏɴ on ㅤtоnrоyalе ̣ cоm' } },
  { address: '0:42dd60fac0e2b162d09be513a5269b008de6112eb5dea7118a50b57175fa809c', index: 213185784381, trust: 'blacklist', dns: null, metadata: { name: '🎁188 TON Bouns from tonxp. com\n' } },
  { address: '0:f9c832fc36bf111fbb5c5ae2ffcde2b7f11b23f057639890c828c2ffe337eade', index: -2898555727317910196, trust: 'whitelist', dns: 'freedombroker.ton', collection: { address: '0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf', name: 'TON DNS Domains' }, metadata: { name: 'freedombroker.ton' } }
]
const JETTONS: TonapiJettonBalance[] = [
  { balance: '583586', wallet_address: { address: '0:aeddc3beb9e8a56788d4ad0ea2b1543bab2a4fae926be60e9363942361301ab1' }, jetton: { address: '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', name: 'Tether USD', symbol: 'USD₮', decimals: 6, verification: 'whitelist' } },
  { balance: '0', wallet_address: { address: '0:982cbbb7861684654573dbf2646a0af1df01f7d2106e0bea4df1114b91a22121' }, jetton: { address: '0:0734b9386cdc039a6afcb273b4d6eb1a7ddda3313c244eda109399f406fc308f', name: 'Proof Of Fun', symbol: '$POF', decimals: 9, verification: 'none' } },
  { balance: '1', wallet_address: { address: '0:378a609f092b60ec51acb00bdb8473080eca4b931655cfcc1a1564f661b2ed01' }, jetton: { address: '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000', name: 'Tonstakers TON', symbol: 'tsTON', decimals: 9, verification: 'whitelist' } },
  { balance: '6500000000000', wallet_address: { address: '0:975556ecae4faa6b6cbd1ecd1fbd535b5d5e6ea32af60375f4c9d1404a0560e9' }, jetton: { address: '0:bf47f2eac82415872529b0b0b96d0506d00b813589bad695ee02a3ea727f169d', name: 'jUSDC', symbol: 'jUSDC  ', decimals: 9, verification: 'blacklist' } },
  { balance: '150000000000000', wallet_address: { address: '0:68a748179d99e16d3d4bfd56a6f8ede799b060aff441143b40a1ba4705784985' }, jetton: { address: '0:65de083a0007638233b6668354e50e44cd4225f1730d66b8b1f19e5d26690751', name: 'Lavandos', symbol: 'LAVE', decimals: 9, verification: 'whitelist' } }
]

describe('wallet sweep', () => {
  const nfts = selectNfts(NFTS.map(toOwnedNft))
  const jettons = selectJettons(JETTONS.map(toOwnedJetton))

  it('selects the same assets as tonapi (skips spam NFTs, the scam jetton and the empty balance)', () => {
    expect(nfts.filter(n => n.include).map(n => n.item.name)).toEqual(['jusaninvest.ton', 'freedombroker.ton'])
    expect(nfts.filter(n => n.include).every(n => n.item.kind === 'domain')).toBe(true)
    expect(jettons.map(j => [j.item.symbol.trim(), j.include, j.disabled])).toEqual([
      ['USD₮', true, false], ['$POF', false, true], ['tsTON', true, false], ['jUSDC', false, false], ['LAVE', true, false]
    ])
  })

  it('builds byte-identical messages to tonapi\'s migration: destination, bounce, attached GRAM and body', () => {
    const msgs = buildAssetMessages({
      nfts: nfts.filter(n => n.include).map(n => n.item),
      jettons: jettons.filter(j => j.include).map(j => j.item),
      target: TARGET,
      testnet: false,
      queryId: i => TONAPI_MIGRATION[i]!.qid
    })
    expect(msgs).toHaveLength(TONAPI_MIGRATION.length)
    msgs.forEach((m, i) => {
      const want = TONAPI_MIGRATION[i]!
      const dest = Address.parseFriendly(m.address)
      expect([dest.address.toRawString(), dest.isBounceable, m.amount]).toEqual([want.dest, true, want.value])
      expect((m.payload as Cell).hash().toString('hex')).toBe(parseBoc(want.body).hash().toString('hex'))
    })
    expect(assetGas(2, 3)).toBe(270_000_000n)
  })

  it('moves only the unlocked part and disables unclaimed mintless jettons', () => {
    const [j] = JETTONS.map(toOwnedJetton)
    const locked = selectJettons([{ ...j!, locked: 83_586n }, { ...j!, needsClaim: true }, { ...j!, locked: j!.balance }])
    expect(locked.map(s => [s.include, s.disabled])).toEqual([[true, false], [false, true], [false, true]])
    const [m] = buildAssetMessages({ nfts: [], jettons: [locked[0]!.item], target: TARGET, testnet: false, queryId: () => 0n })
    const s = (m!.payload as Cell).beginParse()
    s.skip(32 + 64)
    expect(s.loadCoins()).toBe(500_000n)
  })

  it('labels Telegram usernames by collection address, not by name', () => {
    const real = toOwnedNft({ address: '0:01', collection: { address: '0:80D78A35F955A14B679FAA887FF4CD5BFC0F43B4A4EEA2A7E6927F3701B273C2', name: 'Telegram Usernames' } })
    const fake = toOwnedNft({ address: '0:02', collection: { address: '0:0000000000000000000000000000000000000000000000000000000000000001', name: 'Telegram Usernames' } })
    expect([real.kind, fake.kind]).toEqual(['telegram', 'nft'])
  })

  it('sends the remaining GRAM minus the fee reserve, or nothing', () => {
    expect(buildGramSweep(220_425_549n, 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI')).toEqual({ address: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI', amount: 220_425_549n - SWEEP_RESERVE })
    expect(buildGramSweep(SWEEP_RESERVE, 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI')).toBeNull()
  })
})
