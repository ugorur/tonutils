import { Address, Cell } from '@ton/core'
import { describe, expect, it } from 'vitest'
import { buildPayload, parseQueryId, transferLink } from '~/lib/payload-builders/common'
import { attachProblem, buildJettonBody, checkJettonAmount, JETTON_GAS, messageTarget, recommendedAttach } from './logic'

// Real mainnet message bodies, read from toncenter /api/v3/messages?opcode=… on 2026-10-22.
// Expected fields are toncenter's own `message_content.decoded`, not our decoder.
const A = (raw: string) => Address.parse(raw)
const hashOf = (boc: string) => Cell.fromBase64(boc).hash().toString('hex')

describe('jetton transfer', () => {
  it('rebuilds a USD₮ transfer with a text comment bit for bit', () => {
    // msg q+l5N17S+WWpc6oPLdpsd3brNb9OQaOUXk4EunvXkiM= (in tx zycwttXUfmIcKVs6kEnSEpHHs4bqTDi+us0ibGdh9DU=), to jetton wallet 0:60C5A08A…
    const body = buildJettonBody({
      action: 'transfer',
      p: {
        queryId: parseQueryId('13242833898447993311'),
        amount: 1500000n,
        destination: A('0:852443F8599FE6A5DA34FE43049AC4E0BEB3071BB2BFB56635EA9421287C283A'),
        responseDestination: A('0:D73518E2A728397EEB14EF4779126A88C7FE6ED5E19ED51B343CB177F8E1CEBC'),
        forwardTonAmount: 1n,
        forwardPayload: buildPayload('comment', '100 Telegram Stars \n\nRef#BMrmMx1HM'),
        customPayload: null
      }
    })
    expect(body.hash().toString('hex')).toBe(hashOf('te6cckEBAgEAfwABqA+KfqW3x/9EYH553zFuNggBCkiH8LM/zUu0afyGCTWJwX1mDjdlf2rMa9UoQlD4UHUANc1GOKnKDl+6xTvR3kSaojH/m7V4Z7VGzQ8sXf44c68CAwEATAAAAAAxMDAgVGVsZWdyYW0gU3RhcnMgCgpSZWYjQk1ybU14MUhNm9xSWQ=='))
  })
})

describe('jetton burn', () => {
  it('rebuilds a real burn bit for bit', () => {
    // msg 9pkdoH3WECr+Q5GRp9GQb3cm273mJv+XmHVQMmZX+Xg= (tx 7eypquKGImRKXXLDQmN1saQp32cje8pfUN9W6v2DNdI=)
    const body = buildJettonBody({
      action: 'burn',
      p: { queryId: 0n, amount: 174183496n, responseDestination: A('0:3F2A977081938290416ADB1ADEE12E4B6C7B2BF0ABA5D2A5DF488E41D7EF57DE'), customPayload: null }
    })
    expect(body.hash().toString('hex')).toBe(hashOf('te6cckEBAQEANAAAZFlfB7wAAAAAAAAAAECmHUSIAH5VLuEDJwUggtW2Nb3CXJbY9lfhV0ulS76RHIOv3q+8iC8WMg=='))
  })
})

describe('provide_wallet_address', () => {
  it('rebuilds a real TEP-89 request sent to the USD₮ master', () => {
    // msg EJp78buGV5zItYkhosSVCA5GX3NFcaVL5mFnEp6qAQQ= to 0:B113A994… (USD₮ master), tx SODIEB1qth/YjJDkVILrCjSoc1szZyNa0eoNuKjBnkw=
    const real = Cell.fromBase64('te6cckEBAQEAMAAAWyx2uXMAAAAAAAAAB4AQ2CWOtGpQ0j+50aaGBALJtkMESGybsAsmaBntipdFQAjA5dMj')
    const s = real.beginParse()
    expect(s.loadUint(32)).toBe(0x2c76b973) // TEP-89 op
    const queryId = s.loadUintBig(64)
    const owner = s.loadAddress()
    const includeAddress = s.loadBit()
    const body = buildJettonBody({ action: 'provide', p: { queryId, owner, includeAddress } })
    expect(body.hash().toString('hex')).toBe(real.hash().toString('hex'))
  })
})

describe('helpers', () => {
  const master = A('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')
  const wallet = A('0:60c5a08a1ab1c14efecbacd31acba12854b8a3dafc26a8d77273a770fc8eb1ac')
  it('targets the jetton wallet, or the master for provide_wallet_address', () => {
    expect(messageTarget('transfer', wallet, master)?.equals(wallet)).toBe(true)
    expect(messageTarget('burn', wallet, master)?.equals(wallet)).toBe(true)
    expect(messageTarget('provide', wallet, master)?.equals(master)).toBe(true)
  })
  it('recommends forward + 0.05 GRAM and flags too little', () => {
    expect(recommendedAttach('transfer', 1n)).toBe(JETTON_GAS + 1n)
    expect(attachProblem('transfer', 1n, 1n)?.severity).toBe('error')
    expect(attachProblem('transfer', 10_000_000n, 0n)?.severity).toBe('warning')
    expect(attachProblem('transfer', 50_000_001n, 1n)).toBeNull()
  })
  it('validates amounts and query ids', () => {
    expect(checkJettonAmount(0n)).toMatch(/greater/)
    expect(checkJettonAmount(5n, 4n)).toMatch(/More than/)
    expect(checkJettonAmount(5n, 5n)).toBeNull()
    expect(parseQueryId('0x10')).toBe(16n)
    expect(() => parseQueryId('18446744073709551616')).toThrow()
    expect(() => parseQueryId('-1')).toThrow()
  })
  it('makes a ton:// link with the body in bin (base64url)', () => {
    const link = transferLink(wallet, 50_000_000n, Cell.EMPTY)
    expect(link).toMatch(/^ton:\/\/transfer\/EQ[\w-]{46}\?amount=50000000&bin=te6cc[\w-]+$/)
  })
})
