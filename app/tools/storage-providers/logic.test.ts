import { describe, expect, it } from 'vitest'
import { accepts, formatBytes, isUsable, quotes, storageCost, toBytes } from './logic'
import type { StorageProvider } from './logic'

// Verbatim entries from tonapi.io GET /v2/storage/providers (mainnet, 2026-10-23).
const REAL: StorageProvider[] = [
  { address: '0:a549e3364c17583ccc62322061a8096938ef0a1bf7e5b8d89dab88cc5dcb044e', accept_new_contracts: true, rate_per_mb_day: 10000, max_span: 86400, minimal_file_size: 1024, maximal_file_size: 1000000000 },
  // Not a storage provider: get_storage_params on toncenter returns a different layout (13 stack items).
  { address: '0:40da109a8cd784c4a2c13f545dcebecf98cae8229b428156460fc28a3672ddde', accept_new_contracts: true, rate_per_mb_day: 11000000000000, max_span: 2701582336, minimal_file_size: 1, maximal_file_size: 52 },
  { address: '0:39fd6b19ed23f61b31aa6a38858c214880892fa968aca431aeae7d39994ddb14', accept_new_contracts: false, rate_per_mb_day: 1000000, max_span: 86400, minimal_file_size: 1048576, maximal_file_size: 1073741824 },
  { address: '0:059532efb863e963d8dba30a1bbf919def4da41e09a5f7d8c3753f8497e84224', accept_new_contracts: true, rate_per_mb_day: 1999, max_span: 3000, minimal_file_size: 1, maximal_file_size: 10000000020 },
  { address: '0:f836f23de09a218760c75673d5bc7db2a946d69b25d8ffc0ef9beb91c3350516', accept_new_contracts: true, rate_per_mb_day: 1000000000, max_span: 86400, minimal_file_size: 1024, maximal_file_size: 1000000000 },
  { address: '0:c9956217fbb1dc37eed1a83845869b827db1cbaee38c276a7884a2abfc037bfd', accept_new_contracts: true, rate_per_mb_day: 0, max_span: 86400, minimal_file_size: 0, maximal_file_size: 108000000000 }
]

describe('storageCost (storage-contract.fc muldiv(file_size * rate, span, 86400 * 1024 * 1024))', () => {
  it('1 MiB for one day costs exactly the daily rate', () => {
    expect(storageCost(1048576n, 1000000000n, 86400n)).toBe(1000000000n)
  })
  it('1 GB at 10000 nano/MiB/day for 30 days', () => {
    expect(storageCost(1000000000n, 10000n, 2592000n)).toBe(286102294n)
  })
  it('rounds down like the contract', () => {
    expect(storageCost(5n * 1048576n, 1999n, 3000n)).toBe(347n)
    expect(storageCost(1024n, 1n, 86400n)).toBe(0n)
  })
})

describe('provider filters', () => {
  it('drops non-providers, closed and zero-rate providers', () => {
    expect(REAL.map(isUsable)).toEqual([true, false, false, true, true, false])
  })
  it('size bounds', () => {
    expect(accepts(REAL[0]!, 1023)).toBe(false)
    expect(accepts(REAL[0]!, 1000000000)).toBe(true)
    expect(accepts(REAL[0]!, 1000000001)).toBe(false)
  })
  it('quotes sorted by cost', () => {
    const q = quotes(REAL, 100 * 1048576, 30)
    expect(q.map(x => x.provider.rate_per_mb_day)).toEqual([1999, 10000, 1000000000])
    expect(q[2]!.cost).toBe(3000000000000n) // 100 MiB × 30 days × 1 GRAM
  })
})

describe('size helpers', () => {
  it('toBytes / formatBytes', () => {
    expect(toBytes('1.5', 'GB')).toBe(1610612736)
    expect(toBytes('0', 'MB')).toBeNull()
    expect(toBytes('abc', 'MB')).toBeNull()
    expect(formatBytes(1000000000)).toBe('953.67 MiB')
    expect(formatBytes(512)).toBe('512 B')
  })
})
