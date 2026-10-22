import { describe, expect, it } from 'vitest'
import { addressesForPublicKey, detectWalletVersion } from './wallets'

// Vectors are live mainnet accounts (2026-10-22): code_hash + interface from toncenter v3 accountStates,
// public key from tonapi /v2/accounts/{id}/publickey (read from the contract's data on-chain).
describe('detectWalletVersion', () => {
  it.each([
    ['IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=', 'v5r1'], // 0:7968D5F0… interface wallet_v5r1
    ['/rX/aCDi/w2Ug+fg1iyBfYRniftK5YDIeIZtlZ2r1cA=', 'v4r2'], // 0:CE3A368F… wallet_v4r2
    ['hNr6RJ+Ypph3ibojI1gHK8D3bcRSQAKl0JGLmnXS1Zk=', 'v3r2'], // 0:5224058D… wallet_v3r2
    ['EayteVWEQJDyg78ji8FEmHH3g+fMCXlAjT9IWUg+hSU=', 'highload-v3'], // 0:8FBF702A… wallet_highload_v3r1
    ['09FNqaYn8Ow1MzQYKXYq+SuVQLIb8DZl+sCcK0bqu6w=', 'multisig-v2'], // 0:75CF0FFD… multisig_v2
    ['tItTGr7DtxRjgpH3137W3J9qJynvyiBHcTc3TUrotZA=', 'vesting'] // 0:777E7276… wallet_vesting
  ])('%s -> %s', (hash, version) => {
    expect(detectWalletVersion(hash)?.version).toBe(version)
  })

  it('accepts hex and base64url', () => {
    const hex = Buffer.from('IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=', 'base64').toString('hex')
    expect(detectWalletVersion(hex)?.version).toBe('v5r1')
    expect(detectWalletVersion('_rX_aCDi_w2Ug-fg1iyBfYRniftK5YDIeIZtlZ2r1cA=')?.version).toBe('v4r2')
  })

  it('returns null for a jetton master (USDT, code GNW254D/…)', () => {
    expect(detectWalletVersion('GNW254D/C7RRJUwsdg0J1uSFY4zRQHq7lweHUsPBye4=')).toBeNull()
  })
})

describe('addressesForPublicKey', () => {
  const raw = (key: string, net: 'mainnet' | 'testnet', v: string) =>
    addressesForPublicKey(key, net).find(w => w.version === v)!.raw

  it.each([
    ['858c9b29cf104c1c7954034a810bfaaca25ca49f0b39979d8034a0b232321468', 'v3r2', '0:5224058d38e16ae981c2b77a75cc4f4916a33f9ed3d72a7d7aa9e59806780431'],
    ['d4571897d1e9ca9a64902a32748216b3c4baa92eceab4db99cbff8c4543c859e', 'v3r1', '0:1b109ee8aed9d8b1fe0779be9d84419255bdc51f9a9d2db3429d504748c59fc4'],
    // Same vectors as app/tools/mnemonic-generator/logic.test.ts (get_public_key via toncenter)
    ['dc8454f45aca8a33ef456d3af56d95a5dbd880b5892d324c6f0a0a7dcc1c2ff8', 'v4r2', '0:3cd24f73bfc6302d9cca68e1fd2a92d3530063bde0935c99b0187d57715b1699'],
    ['02bc2f2b7882d72b25eb04bc0a639414d60b99cf92c5074e090189a56aa2a6a3', 'v5r1', '0:0c8c0fb575238aaa844a89b36eb7546359e4e40297bcbe574c05611d884f36f1']
  ])('mainnet %s %s', (key, v, address) => {
    expect(raw(key, 'mainnet', v)).toBe(address)
  })

  it('W5 testnet uses wallet_id 2147483645, a different account', () => {
    expect(raw('922230e429c4eb6449d87ee90bc6d016766242a7536fbed8992fd4a8ffa1eceb', 'testnet', 'v5r1'))
      .toBe('0:e59587981adc7bc423d0fb46cd1f0a56bb53532957dd9e8ba5028d592d2c315d')
  })

  it('formats testnet addresses with the test flag', () => {
    const w = addressesForPublicKey('858c9b29cf104c1c7954034a810bfaaca25ca49f0b39979d8034a0b232321468', 'testnet', { versions: ['v3r2'] })[0]!
    expect(w.nonBounceable).toMatch(/^0Q/)
    expect(w.bounceable).toMatch(/^kQ/)
  })

  it('rejects a key that is not 32 bytes', () => {
    expect(() => addressesForPublicKey('abcd', 'mainnet')).toThrow(/32 bytes/)
  })
})
