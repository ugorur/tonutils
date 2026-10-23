// TonConnect feature flags (spec: ton-connect spec/wallets-list.md § features, connect.md § Feature).
// Shared by tonconnect-wallets-status (static list) and tonconnect-tx-tester (runtime DeviceInfo.features). Pure TS.

export type ItemType = 'ton' | 'jetton' | 'nft'

export interface MessageFeature {
  maxMessages: number
  extraCurrency: boolean
  /** Structured item kinds; [] means only raw messages[]. */
  itemTypes: ItemType[]
}

export interface FeatureSummary {
  /** null: the wallet does not list SendTransaction at all. */
  sendTransaction: MessageFeature | null
  /** Only the deprecated bare 'SendTransaction' string: max 4 messages per the old spec. */
  legacySendTransaction: boolean
  /** signData payload types; [] = not supported. */
  signData: string[]
  signMessage: MessageFeature | null
  embeddedRequest: boolean
}

/** The deprecated string feature implied 4 messages (TonConnect SDK default). */
export const LEGACY_MAX_MESSAGES = 4

type Obj = { name?: unknown, maxMessages?: unknown, extraCurrencySupported?: unknown, itemTypes?: unknown, types?: unknown }

function msgFeature(f: Obj): MessageFeature {
  return {
    maxMessages: typeof f.maxMessages === 'number' && f.maxMessages > 0 ? f.maxMessages : LEGACY_MAX_MESSAGES,
    extraCurrency: f.extraCurrencySupported === true,
    itemTypes: Array.isArray(f.itemTypes) ? f.itemTypes.filter((t): t is ItemType => t === 'ton' || t === 'jetton' || t === 'nft') : []
  }
}

export function summarizeFeatures(features: readonly unknown[] | undefined): FeatureSummary {
  const list = features ?? []
  const obj = (name: string) => list.find((x): x is Obj => typeof x === 'object' && x !== null && (x as Obj).name === name)
  const send = obj('SendTransaction')
  const legacy = !send && list.includes('SendTransaction')
  const sign = obj('SignMessage')
  const data = obj('SignData')
  return {
    sendTransaction: send ? msgFeature(send) : legacy ? { maxMessages: LEGACY_MAX_MESSAGES, extraCurrency: false, itemTypes: [] } : null,
    legacySendTransaction: legacy,
    signData: Array.isArray(data?.types) ? data.types.filter((t): t is string => typeof t === 'string') : [],
    signMessage: sign ? msgFeature(sign) : null,
    embeddedRequest: !!obj('EmbeddedRequest')
  }
}
