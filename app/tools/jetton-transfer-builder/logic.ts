// TEP-74 jetton transfer / burn and TEP-89 provide_wallet_address messages.
// Bodies come from the shared, mainnet-verified builders in ~/utils/ton/messages.
import type { Address, Cell } from '@ton/core'
import { jettonBurnBody, jettonTransferBody, provideWalletAddressBody } from '~/utils/ton/messages'
import { COIN_SYMBOL, formatCoin } from '~/utils/currency'

export type JettonAction = 'transfer' | 'burn' | 'provide'

/** Gas the sender's jetton wallet needs on top of forward_ton_amount; the unused part comes back as excesses. */
export const JETTON_GAS = 50_000_000n // 0.05 GRAM

export interface TransferParams {
  queryId: bigint
  amount: bigint
  destination: Address
  responseDestination: Address | null
  forwardTonAmount: bigint
  forwardPayload: Cell | null
  customPayload: Cell | null
}

export interface BurnParams {
  queryId: bigint
  amount: bigint
  responseDestination: Address | null
  customPayload: Cell | null
}

export interface ProvideParams {
  queryId: bigint
  owner: Address
  includeAddress: boolean
}

export type JettonParams =
  | { action: 'transfer', p: TransferParams }
  | { action: 'burn', p: BurnParams }
  | { action: 'provide', p: ProvideParams }

export function buildJettonBody(x: JettonParams): Cell {
  switch (x.action) {
    case 'transfer':
      return jettonTransferBody(x.p)
    case 'burn':
      return jettonBurnBody(x.p)
    case 'provide':
      return provideWalletAddressBody(x.p)
  }
}

/** Where the message goes: your jetton wallet for transfer/burn, the jetton master for provide_wallet_address. */
export function messageTarget(action: JettonAction, jettonWallet: Address | null, master: Address | null): Address | null {
  return action === 'provide' ? master : jettonWallet
}

/** GRAM to attach so the chain does not run out of gas. */
export function recommendedAttach(action: JettonAction, forwardTonAmount = 0n): bigint {
  return action === 'transfer' ? forwardTonAmount + JETTON_GAS : JETTON_GAS
}

/** Problems with the attached GRAM that would make the transfer fail or bounce. */
export function attachProblem(action: JettonAction, attach: bigint, forwardTonAmount: bigint): { severity: 'error' | 'warning', text: string } | null {
  if (action === 'transfer' && attach <= forwardTonAmount) {
    return { severity: 'error', text: 'The attached amount must be larger than the forward amount: the jetton wallet pays the forward amount and its own gas out of it.' }
  }
  const need = recommendedAttach(action, forwardTonAmount)
  if (attach < need) {
    return { severity: 'warning', text: `Less than the recommended ${formatCoin(need)}. Too little gas makes the jetton wallet reject the message; the ${COIN_SYMBOL} bounces back minus fees and no tokens move.` }
  }
  return null
}

/** Jetton amount must be a positive Coins value (VarUInteger 16 → < 2^120). */
export function checkJettonAmount(amount: bigint | null, balance?: bigint | null): string | null {
  if (amount === null) return 'Enter an amount'
  if (amount <= 0n) return 'Amount must be greater than zero'
  if (amount >= 1n << 120n) return 'Amount is too large for the Coins type'
  if (balance !== undefined && balance !== null && amount > balance) return `More than this wallet holds: the jetton wallet will reject it and bounce the ${COIN_SYMBOL}.`
  return null
}
