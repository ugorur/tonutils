import { Address, beginCell, Cell, Dictionary, loadStateInit, toNano } from '@ton/core'
import { Blockchain } from '@ton/sandbox'
import { describe, expect, it } from 'vitest'
import { codes } from '~/lib/deployers/codes'
import { WALLET_CODE_HASHES } from '~/utils/ton/wallets'
import { multisigData, planMultisig, validateMultisig } from './logic'

// Real multisig.ton.org deploy on mainnet: tx m4mnJB8PuTnpzoiiXB0JHwRrrhd2ibxM8FlYC/JNKH4= (2025-03-13) from
// 0:9F4F95CA…D16E to 0:F2A2E706…4317, 1 TON, no body, in_msg.init_state from toncenter /api/v3/transactions.
// Signers and threshold from toncenter /api/v3/multisig/wallets (threshold 3, no proposers, next_order_seqno -1).
const ADDRESS = '0:F2A2E706BF1295FA6388E30A99C431CE294AEF002727946D013A85DFC1554317'
const INIT_HASH = '8qLnBr8SlfpjiOMKmcQxzilK7wAnJ5RtATqF38FVQxc='
const SIGNERS = [
  '0:84E665DC2C93A7BA96E667A295AF6BC8D66EEB649AA31551445AE39BC08AD625',
  '0:8F50D1142190185CCEEA806828621DA1C117342AC9BDE6E1EE35041DDDB2780C',
  '0:06E574DA10626723415534A50848C919A25794729EF924CFE494CB0699014B8F',
  '0:DB0848861E60E68AD0984D4624A99EE795179B89D4FCD5AFAE2179F07C81DA3B',
  '0:403F1442051C7BD99D70600EA11E5B09CFD8474A827701CF7A3A2A53C5FE713C',
  '0:EC9DEA5890A65CFDB51845018940ADA710074FE3C3FDF323EA0CF88911F9AAF7'
]
const INIT_STATE = 'te6cckECHwEABbEAAgE0AQIBFP8A9KQT9LzyyAsDAUUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMGYBQCAWIEBQLK0DPQ0wMBcbCSXwPg+kAwItdJwACSXwPgAtMfASDAAJJfBOAB0z8B7UTQ0/8BAdMHAQHU0wcBAfQE0gABAdEoghD3GFEPuuMPBURDyFAGAcv/UAQBywcSzAEBywf0AAEBygDJ7VQGBwIBIA4PAZ44BtP/ASizjhIghP+6kjAkllMFuvLj8OIFpAXeAdIAAQHTBwEB0y8BAdTRI5EmkSriUjB49A5vofLj7x7HBfLj7yD4I77y4G8g+COhVG1wCAKaNjgmghB1CX9duo66BoIQoyxZv7qOqfgoGMcF8uBlA9TREDQQNkZQ+AB/jo0hePR8b6UgkTLjDQGz5lsQNVA0kjQ24lBUE+MNQBVQMwQMCwHU+AcDgwz5QTADgwj5QTD4B1AGoYEn+AGgcPg2gRIGcPg2oIEr7HD4NqCBHZhw+DagIqYGIqCBBTkmoCegcPg4I6SBApgnoHD4OKADpgZYoIEG4FAFoFAFoEMDcPg3WaABoBy+8uBk+ChQAwkCuAFwAshYzxYBAcv/yYgiyMsB9AD0AMsAyXAh+QB0yMsCEsoHy//J0MiCEJxz+6JYCgLLH8s/JgHLB1JQzFALAcsvG8wqAcoACpUZAcsHCJEw4hAkcECJgBiAUNs8EwoAko5FyFgBywVQBc8WUAP6AlRxIyPtRO1F7UefW8hQA88XyRN3UAPLa8zM7WftZe1kdH/tEZh2ActrzAHPF+1B7fEB8v/JAfsA2wYC4jYE0/8BAdMvAQHTBwEB0/8BAdTR+ChQBQFwAshYzxYBAcv/yYgiyMsB9AD0AMsAyXAB+QB0yMsCEsoHy//J0BvHBfLgZSb5ABq6UZO+GbDy4GYH+CO+8uBvRBRQVvgAf46NIXj0fG+lIJEy4w0Bs+ZbEwwB+gLXTNDTHwEgghDxOB5buo5qghAdDPvTuo5ebETTBwEB1CF/cI4XURJ49HxvpTIhmVMCuvLgZwKkAt4BsxLmbCEgwgDy4G4jwgDy4G1TMLvy4G0B9AQhf3COF1ESePR8b6UyIZlTArry4GcCpALeAbMS5mwhMNFVI5Ew4uMNDQAQMNMH1AL7ANEBQ790/2omhp/4CA6YOAgOppg4CA+gJpAACA6Igar4KA/BHQwQAgFmERIAwvgHA4MM+UEwA4MI+UEw+AdQBqGBJ/gBoHD4NoESBnD4NqCBK+xw+DaggR2YcPg2oCKmBiKggQU5JqAnoHD4OCOkgQKYJ6Bw+DigA6YGWKCBBuBQBaBQBaBDA3D4N1mgAaAA8bDK+1E0NP/AQHTBwEB1NMHAQH0BNIAAQHRI39wjhdREnj0fG+lMiGZUwK68uBnAqQC3gGzEuZsIVIwuvLgbCF/cI4XURJ49HxvpTIhmVMCuvLgZwKkAt4BsxLmbCEwIsIA8uBuJMIA8uBtUkO78uBtAZIzf5ED4gOABWbDJ/goAQFwAshYzxYBAcv/yYgiyMsB9AD0AMsAyXAB+QB0yMsCEsoHy//J0IBMIQgJjBagGHIVsLM8F3LDfWBXHFHWHBWfKtfBJ40C89ZJR8wIByxUWAgEgFxgCAUgdHgIBIBkaAgEgGxwAQyAEJzMu4WSdPdS3Mz0UrXteRrN3WyTVGKqKItcc3gRWsSwAQyAEeoaIoQyAwuZ3VANBQxDtDgi5oVZN7zcPcagg7u2TwGQAQyAANyum0IMTORoKqaUoQkZIzRK8o5T3ySZ/JKZYNMgKXHwAQyAG2EJEMPMHNFaEwmoxJUz3PKi83E6n5q19cQvPg+QO0dwAQyACAfiiECjj3szrgwB1CPLYTn7COlQTuA570dFSni/zieQAQyAHZO9SxIUy5+2owigMSgVtOIA6fx4f75kfUGfESI/NV7wBn9OQ'

const form = (signers: string[], threshold: string, proposers: string[] = []) => ({ signers: signers.join('\n'), proposers: proposers.join('\n'), threshold })

describe('code', () => {
  it('is the Multisig v2 code running on mainnet', () => {
    expect(WALLET_CODE_HASHES[codes().multisig.hash().toString('base64')]?.version).toBe('multisig-v2')
    const onchain = loadStateInit(Cell.fromBase64(INIT_STATE).beginParse())
    expect(onchain.code!.hash().equals(codes().multisig.hash())).toBe(true)
  })
})

describe('planMultisig', () => {
  const { config, errors } = validateMultisig(form(SIGNERS, '3'))
  it('validates the real config', () => {
    expect(errors).toEqual({})
    expect(config!.allowArbitrarySeqno).toBe(true)
  })
  it('reproduces the mainnet StateInit and address bit for bit', () => {
    const plan = planMultisig(config!)
    expect(plan.address.toRawString().toUpperCase()).toBe(ADDRESS.toUpperCase())
    expect(plan.stateInit.hash().toString('base64')).toBe(INIT_HASH)
    expect(plan.stateInit.equals(Cell.fromBase64(INIT_STATE))).toBe(true)
  })
  it('signer order matters (index = position)', () => {
    const swapped = validateMultisig(form([SIGNERS[1]!, SIGNERS[0]!, ...SIGNERS.slice(2)], '3')).config!
    expect(planMultisig(swapped).address.toRawString().toUpperCase()).not.toBe(ADDRESS.toUpperCase())
  })
})

describe('validateMultisig', () => {
  it('accepts friendly addresses, commas and blank lines', () => {
    const friendly = Address.parse(SIGNERS[0]!).toString()
    const r = validateMultisig({ signers: `${friendly},\n\n${SIGNERS[1]}`, proposers: '', threshold: '2' })
    expect(r.config?.signers.map(a => a.toRawString().toUpperCase())).toEqual(SIGNERS.slice(0, 2))
  })
  it('rejects bad input with readable errors', () => {
    expect(validateMultisig(form([], '1')).errors.signers).toMatch(/at least one/)
    expect(validateMultisig(form(['nope'], '1')).errors.signers).toMatch(/Signer 1 is not a valid/)
    expect(validateMultisig(form(SIGNERS.slice(0, 2), '3')).errors.threshold).toMatch(/more than the number of signers \(2\)/)
    expect(validateMultisig(form(SIGNERS.slice(0, 2), '0')).errors.threshold).toBeDefined()
    expect(validateMultisig(form(SIGNERS.slice(0, 2), '1.5')).errors.threshold).toBeDefined()
    expect(validateMultisig(form([SIGNERS[0]!, SIGNERS[0]!], '1')).errors.signers).toMatch(/already listed as signer 1/)
    expect(validateMultisig(form([SIGNERS[0]!], '1', [SIGNERS[0]!])).errors.proposers).toMatch(/already listed as signer 1/)
  })
})

// Runs the official contract: deploy with our exact message, then read it back with its own getter.
describe('end to end in @ton/sandbox', () => {
  it('deploys and get_multisig_data returns our signers, proposers and threshold', async () => {
    const bc = await Blockchain.create()
    const payer = await bc.treasury('payer')
    const a = await bc.treasury('a')
    const b = await bc.treasury('b')
    const p = await bc.treasury('p')
    const { config } = validateMultisig(form([a.address.toString(), b.address.toString()], '2', [p.address.toString()]))
    const plan = planMultisig(config!)
    expect(plan.stateInit.equals(beginCell().storeBit(false).storeBit(false).storeMaybeRef(plan.init.code).storeMaybeRef(plan.init.data).storeBit(false).endCell())).toBe(true)
    await payer.send({ to: plan.address, value: toNano('1'), init: plan.init, bounce: true })
    const acc = await bc.getContract(plan.address)
    expect(acc.accountState?.type).toBe('active')
    expect(acc.balance).toBeGreaterThan(toNano('0.99'))
    const r = (await bc.runGetMethod(plan.address, 'get_multisig_data')).stackReader
    expect(r.readBigNumber()).toBe(-1n) // allow_arbitrary_order_seqno
    expect(r.readNumber()).toBe(2)
    const list = (c: Cell | null) => (c ? Dictionary.loadDirect(Dictionary.Keys.Uint(8), Dictionary.Values.Address(), c).values().map(x => x.toString()) : [])
    expect(list(r.readCellOpt())).toEqual([a.address.toString(), b.address.toString()])
    expect(list(r.readCellOpt())).toEqual([p.address.toString()])
  })
})

it('multisigData is a fresh contract (next_order_seqno 0)', () => {
  const s = multisigData({ threshold: 1, signers: [Address.parse(SIGNERS[0]!)], proposers: [], allowArbitrarySeqno: true }).beginParse()
  expect(s.loadUintBig(256)).toBe(0n)
})
