import { describe, expect, it } from 'vitest'
import { ALL_OPCODES, decodedName, opForms, searchOpcodes } from './logic'

// Expected op values are copied from the standards' TL-B, not from our table:
// TEP-74 (jettons), TEP-89, TEP-62 (NFT), TEP-66, TEP-122, TEP-126, TEP-526, wallet_v5.fc prefixes,
// docs.ton.org messages page (bounce prefixes), ton-blockchain/jetton-contract jetton.tlb.

const first = (q: string) => searchOpcodes(q)[0]

describe('opcode lookup', () => {
  it.each([
    ['0x0f8a7ea5', 'jetton_transfer'], // TEP-74 transfer#0f8a7ea5
    ['0x178d4519', 'jetton_internal_transfer'],
    ['0x7362d09c', 'jetton_transfer_notification'],
    ['0xd53276db', 'excesses'],
    ['0x595f07bc', 'jetton_burn'],
    ['0x7bdd97de', 'jetton_burn_notification'],
    ['0x2c76b973', 'provide_wallet_address'], // TEP-89
    ['0xd1735400', 'take_wallet_address'],
    ['0x5fcc3d14', 'nft_transfer'], // TEP-62
    ['0x05138d91', 'nft_ownership_assigned'],
    ['0x2fcb26a2', 'nft_get_static_data'],
    ['0x8b771735', 'nft_report_static_data'],
    ['0x693d3950', 'get_royalty_params'], // TEP-66
    ['0x2167da4b', 'encrypted_comment'],
    ['0x7369676e', 'w5_external_signed'], // wallet_v5.fc prefix::signed_external
    ['0x73696e74', 'w5_internal_signed'],
    ['0x6578746e', 'w5_extension_action'],
    ['0xffffffff', 'bounced'],
    ['0xfffffffe', 'new_bounce_body'],
    ['0x7431f221', 'jetton_drop_admin'],
    ['0x5fcc3d1b', 'nft_reveal_nft_request'], // TEP-122
    ['0x013a3ca6', 'cnft_claim'], // TEP-126
    ['0xac392598', 'display_multiplier_changed'] // TEP-526
  ])('%s → %s', (q, name) => {
    expect(first(q)?.name).toBe(name)
  })

  it('accepts hex without 0x and signed / unsigned decimal', () => {
    expect(first('0f8a7ea5')?.name).toBe('jetton_transfer')
    expect(first('260734629')?.name).toBe('jetton_transfer') // 0x0f8a7ea5
    expect(first('-718113061')?.name).toBe('excesses') // 0xd53276db - 2^32
    expect(first('3576854235')?.name).toBe('excesses')
    expect(first('0')?.name).toBe('text_comment')
  })

  it('finds by words and by hex fragment', () => {
    expect(searchOpcodes('burn notification').map(e => e.name)).toContain('jetton_burn_notification')
    expect(searchOpcodes('ownership_assigned').map(e => e.name)).toEqual(['nft_ownership_assigned'])
    expect(searchOpcodes('5fcc3d').map(e => e.name)).toContain('nft_transfer')
  })

  it('group filter', () => {
    const sbt = searchOpcodes('', 'sbt')
    expect(sbt.length).toBeGreaterThan(3)
    expect(sbt.every(e => e.group === 'sbt')).toBe(true)
  })

  it('has no duplicate op codes', () => {
    const ops = ALL_OPCODES.map(e => e.op >>> 0)
    expect(new Set(ops).size).toBe(ops.length)
  })

  it('shows all notations', () => {
    expect(opForms(0xd53276db)).toEqual({ hex: '0xd53276db', unsigned: '3576854235', signed: '-718113061' })
  })

  it('reads toncenter decode responses', () => {
    // Real responses from https://toncenter.com/api/v3/decode?opcodes=… (2026-10-23)
    expect(decodedName({ opcodes: ['jetton_transfer'] })).toBe('jetton_transfer')
    expect(decodedName({ opcodes: ['unknown'] })).toBeNull()
    expect(decodedName(null)).toBeNull()
  })
})
