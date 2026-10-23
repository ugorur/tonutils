import { WalletContractV5R1 } from '@ton/ton'
import { describe, expect, it } from 'vitest'
import { normalizeHash } from '~/lib/contracts-read/cells'
import { MASTER_ACCOUNT, MASTER_HASHES, MASTER_INSPECT, MASTER_TONAPI, WALLET_ACCOUNT, WALLET_HASHES, WALLET_TONAPI } from './fixture'
import { inspect, interfaceLabel, type ToncenterAccount } from './logic'

// Expected hashes come from toncenter /api/v3/accountStates (the indexer computes them itself) for the same state.
describe('inspect: USDT jetton master', () => {
  const r = inspect(MASTER_ACCOUNT as ToncenterAccount, MASTER_TONAPI, MASTER_INSPECT)

  it('computes code and data hashes that match toncenter', () => {
    expect(r.code!.hashHex).toBe(normalizeHash(MASTER_HASHES.code_hash))
    expect(r.code!.hashHex).toBe(MASTER_INSPECT.code_hash) // tonapi agrees
    expect(r.data!.hashHex).toBe(normalizeHash(MASTER_HASHES.data_hash))
  })

  it('summarises the account', () => {
    expect(r.status).toBe('active')
    expect(r.balance).toBe(1073000516641n)
    expect(r.code!.libraries).toEqual([])
    expect(r.code!.wallet).toBeNull()
    expect(r.code!.stats.cells).toBe(24) // BOC header b5ee9c72 01 02 18: 24 cells
    expect(r.interfaces).toEqual([{ id: 'jetton_master', label: 'Jetton master (TEP-74)' }])
    expect(r.name).toBe('Tether USD')
    expect(r.compiler).toBe('FunC')
    expect(r.methods.map(m => m.name)).toEqual(['get_jetton_data', 'get_next_admin_address', 'get_wallet_address'])
    expect(r.methods.find(m => m.name === 'get_jetton_data')!.id).toBe(106029) // crc16("get_jetton_data") | 0x10000
    expect(r.hasSource).toBe(true)
  })
})

describe('inspect: wallet v4r2', () => {
  const r = inspect(WALLET_ACCOUNT as ToncenterAccount, WALLET_TONAPI, null)

  it('recognises the wallet version from the code hash', () => {
    expect(r.code!.hashHex).toBe(normalizeHash(WALLET_HASHES.code_hash))
    expect(r.data!.hashHex).toBe(normalizeHash(WALLET_HASHES.data_hash))
    expect(r.code!.wallet?.version).toBe('v4r2')
    expect(r.code!.wallet?.label).toBe('Wallet v4R2')
    expect(WALLET_TONAPI.interfaces).toContain('wallet_v4r2')
    expect(r.interfaces).toEqual([]) // tonapi's wallet_v4r2 is not shown twice
    expect(r.methods).toEqual([])
    expect(r.hasSource).toBe(false)
  })
})

describe('inspect: W5 wallet', () => {
  it('does not repeat tonapi wallet_v5r1 next to the detected W5 badge', () => {
    // W5 (v5R1) code taken from @ton/ton WalletContractV5R1, an independent implementation
    const code = WalletContractV5R1.create({ publicKey: Buffer.alloc(32), workchain: 0 }).init.code.toBoc().toString('base64')
    const r = inspect({ balance: '0', code, data: null, status: 'active', frozen_hash: null, last_transaction_lt: null }, { interfaces: ['wallet_v5r1'] }, null)
    expect(r.code!.wallet?.version).toBe('v5r1')
    expect(r.interfaces).toEqual([])
  })
})

describe('inspect: uninit account', () => {
  // toncenter /api/v3/account for 0:00…0123 (never deployed, holds a balance)
  it('has no code or data', () => {
    const r = inspect({ balance: '2220438433', code: null, data: null, status: 'uninit', frozen_hash: null, last_transaction_lt: '22810939000007' }, { interfaces: [] }, null)
    expect(r.code).toBeNull()
    expect(r.data).toBeNull()
    expect(r.balance).toBe(2220438433n)
  })
})

describe('interfaceLabel', () => {
  it('formats known and unknown ids', () => {
    expect(interfaceLabel('wallet_v5r1')).toBe('Wallet v5R1')
    expect(interfaceLabel('stonfi_pool_v2')).toBe('Stonfi pool v2')
  })
})
