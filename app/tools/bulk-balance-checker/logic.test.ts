import { describe, expect, it } from 'vitest'
import type { ToncenterWalletStates } from '~/lib/accounts/core'
import { mergeStates, parseAccountList } from '~/lib/accounts/core'
import { buildResults, csvRows, jettonBalancesByOwner, jettonFromTonapi, summarize, trustedCodeHashes } from './logic'

const USDT = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'
const TF = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8'
const HOLDER = '0:e6f3d8824f46b1efbab9afc684793428c55fed69b46a15a49be69a29bc49e530'

// toncenter v3 /jetton/wallets?owner_address=…(top 100 accounts)&jetton_address=USD₮ (2026-10-22), 3 of 31 items.
// HOLDER's 117725650 matches tonapi /accounts/HOLDER/jettons/USD₮ independently.
const WALLETS = [
  { owner: '0:E6F3D8824F46B1EFBAB9AFC684793428C55FED69B46A15A49BE69A29BC49E530', jetton: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE', balance: '117725650' },
  { owner: '0:601B679B3C7AA11B41E45D428E8150813223C65C72053ECD90658BC501CF82A7', jetton: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE', balance: '100' },
  { owner: '0:D8E3E2AD5716B0654FD5BDAECA4CE865871F07A348C8D1A87279B613E58B8991', jetton: '0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE', balance: '0' }
]

// toncenter v3 /walletStates for TF and the USD₮ master (2026-10-22), trimmed.
const STATES: ToncenterWalletStates = {
  wallets: [
    { address: TF.toUpperCase(), is_wallet: true, wallet_type: 'wallet v3 r2', seqno: 343, wallet_id: 698983191, balance: '1592542221079555', status: 'active', code_hash: 'hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=' },
    { address: USDT.toUpperCase(), is_wallet: false, balance: '1073000516641', status: 'active', code_hash: 'GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=' }
  ],
  address_book: { [USDT.toUpperCase()]: { user_friendly: '', domain: null, interfaces: ['jetton_master'] } }
}

describe('jetton helpers', () => {
  it('sums balances per owner for the chosen master only', () => {
    const m = jettonBalancesByOwner([...WALLETS, { owner: WALLETS[0]!.owner, jetton: '0:' + '1'.repeat(64), balance: '5' }], USDT)
    expect(m.get(HOLDER)).toBe(117725650n)
    expect(m.get('0:601b679b3c7aa11b41e45d428e8150813223c65c72053ecd90658bc501cf82a7')).toBe(100n)
    expect(m.size).toBe(3)
  })
  it('ignores wallets that do not run the master\'s wallet code', () => {
    // toncenter v3 /jetton/masters?address=USD₮ -> jetton_wallet_code_hash; Binance's real USD₮ wallet
    // 0:8CEE9BB6…94E0 reports the same code_hash in /jetton/wallets (2026-10-23).
    const CODE = 'iUaPAseOVwgC45l5yFFvw43wfqdqSDV+BTbyuns+43s='
    const real = { ...WALLETS[0]!, code_hash: CODE }
    const fake = { ...WALLETS[0]!, balance: '999999999999', code_hash: 'GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=' }
    expect(jettonBalancesByOwner([real, fake], USDT, new Set([CODE])).get(HOLDER)).toBe(117725650n)
    expect(jettonBalancesByOwner([real, fake], USDT, null).get(HOLDER)).toBe(117725650n + 999999999999n)
  })
  it('trusts the code the largest holders run when the master reports another hash (tsTON)', () => {
    // toncenter v3 /jetton/masters?address=EQC98_qA…QAJav -> jetton_wallet_code_hash CJYh…, but all 200 largest
    // wallets (/jetton/wallets?jetton_address=…&sort=desc) run Er67…. The top one, 0:1178…9099 of owner
    // 0:DB7F…DA23, holds 9046010917713486, which tonapi /accounts/0:db7f…/jettons/EQC98_… confirms (2026-10-23).
    const TSTON = '0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000'
    const OWNER = '0:db7ff3d4d432c072778ccd68e351b2bf55cee86a13f488ea6e1dbc48c037da23'
    const WALLET_CODE = 'Er67DcjiArfib3IeJUfha7nrrsk09lfRnyLnbWK+yHg='
    const top = { owner: OWNER.toUpperCase(), jetton: TSTON.toUpperCase(), balance: '9046010917713486', code_hash: WALLET_CODE }
    const hashes = trustedCodeHashes('CJYh3XfgqaSuRCeeWS8T1qtcVd7NYMyew2t8KuQNFZU=', [top, { code_hash: WALLET_CODE }, { code_hash: 'GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=' }])
    expect([...hashes]).toEqual(['CJYh3XfgqaSuRCeeWS8T1qtcVd7NYMyew2t8KuQNFZU=', WALLET_CODE])
    expect(jettonBalancesByOwner([top], TSTON, hashes).get(OWNER)).toBe(9046010917713486n)
    expect(jettonBalancesByOwner([top], TSTON, new Set(['CJYh3XfgqaSuRCeeWS8T1qtcVd7NYMyew2t8KuQNFZU='])).get(OWNER)).toBeUndefined()
  })
  it('reads decimals from tonapi /jettons/{master}', () => {
    // tonapi /v2/jettons/EQCxE6mU… metadata (decimals "6", verification whitelist)
    expect(jettonFromTonapi({ metadata: { address: USDT, symbol: 'USD₮', decimals: '6' }, verification: 'whitelist' })).toEqual({ master: USDT, symbol: 'USD₮', decimals: 6, verification: 'whitelist' })
    expect(jettonFromTonapi({ metadata: { address: USDT } }).decimals).toBe(9)
  })
})

describe('buildResults', () => {
  const NONEXIST = '0:1234567812345678123456781234567812345678123456781234567812345678'
  const rows = parseAccountList(['address,name', `${TF},tf`, 'foundation.ton', 'nope.ton', 'EQbad', `${USDT}`, `${TF}`, NONEXIST, HOLDER].join('\n'))
  const raws = [TF, USDT, NONEXIST, HOLDER]
  const states = new Map(mergeStates(raws, STATES, null).map(s => [s.raw, s]))
  const names = new Map<string, string | Error>([['foundation.ton', TF], ['nope.ton', new Error('nope.ton does not point to a wallet')]])
  const res = buildResults(rows, names, states, jettonBalancesByOwner(WALLETS, USDT))

  it('keeps input order and flags problems', () => {
    expect(res.map(r => r.status)).toEqual(['ok', 'ok', 'unresolved', 'invalid', 'ok', 'duplicate', 'ok', 'ok'])
    expect(res[1]).toMatchObject({ raw: TF, input: 'foundation.ton' })
    expect(res[2]!.note).toMatch(/does not point/)
    expect(res[5]!.note).toBe('Same as line 2')
    expect(res[7]!.jetton).toBe(117725650n)
    expect(res[0]!.jetton).toBe(0n)
  })
  it('summarizes', () => {
    expect(summarize(res)).toEqual({ checked: 5, problems: 2, active: 3, empty: 2, total: 1592542221079555n * 2n + 1073000516641n, jettonTotal: 117725650n })
  })
  it('exports exact amounts', () => {
    const csv = csvRows(res, { coin: 'GRAM', jetton: { master: USDT, symbol: 'USDT', decimals: 6 } })
    expect(csv[0]).toMatchObject({ line: 2, status: 'active', address: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI', balance_GRAM: '1592542.221079555', balance_nano: '1592542221079555', type: 'Wallet v3R2', seqno: 343, balance_USDT: '0' })
    expect(csv[4]).toMatchObject({ address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', type: 'Jetton master' })
    expect(csv[7]).toMatchObject({ balance_USDT: '117.72565', status: 'nonexist' })
    expect(csv[3]).toMatchObject({ status: 'invalid', balance_GRAM: '' })
  })
})
