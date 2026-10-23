// Jetton deployer: form validation and the exact messages sent through TonConnect. Pure TS (+ @ton/core).
import type { Cell } from '@ton/core'
import { dropAdminBody, FEES, MAX_COINS, validateMetadata, type DeployPlan, type MetadataErrors, type MetadataForm } from '~/lib/token-launch/jetton-minter'
import { parseJettonAmount } from '~/utils/ton/jetton'

export interface DeployForm extends MetadataForm {
  supply: string
}

export type FormErrors = MetadataErrors & { supply?: string }

export function validateForm(f: DeployForm): { errors: FormErrors, content?: Cell, mintAmount?: bigint, decimals: number } {
  const { errors, content, decimals } = validateMetadata(f) as { errors: FormErrors, content?: Cell, decimals: number }
  let mintAmount: bigint | undefined
  try {
    mintAmount = parseJettonAmount(f.supply, decimals)
    if (mintAmount <= 0n) throw new Error('The initial supply must be more than 0.')
    if (mintAmount > MAX_COINS) throw new Error('Too large: a jetton balance can hold at most 2^120 - 1 base units.')
  }
  catch (e) {
    mintAmount = undefined
    errors.supply = f.supply.trim() ? (e as Error).message : 'Enter how many tokens to create.'
  }
  if (Object.keys(errors).length) return { errors, decimals }
  return { errors, content, mintAmount, decimals }
}

export interface DeployMessage {
  address: string
  amount: bigint
  payload: Cell
  stateInit?: Cell
}

/** Message 1 deploys + mints; optional message 2 drops the admin right after (same sender -> same receiver keeps order). */
export function deployMessages(plan: DeployPlan, renounce: boolean, testnet: boolean): DeployMessage[] {
  const to = plan.address.toString({ bounceable: true, testOnly: testnet, urlSafe: true })
  const msgs: DeployMessage[] = [{ address: to, amount: plan.value, payload: plan.body, stateInit: plan.stateInit }]
  if (renounce) msgs.push({ address: to, amount: FEES.v2.admin, payload: dropAdminBody('v2') })
  return msgs
}
