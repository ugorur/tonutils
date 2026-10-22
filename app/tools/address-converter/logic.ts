import { Address } from '@ton/core'

export interface FriendlyForms {
  /** URL-safe base64 (- and _), the form wallets and explorers show. */
  urlSafe: string
  /** Standard base64 (+ and /). */
  standard: string
}

export interface NetworkForms {
  bounceable: FriendlyForms
  nonBounceable: FriendlyForms
}

export interface AddressConversion {
  workchain: number
  /** 32-byte account id, lowercase hex. */
  hashHex: string
  raw: string
  mainnet: NetworkForms
  testnet: NetworkForms
  /** What the input looked like. Flags are null for raw input (raw carries no flags). */
  input: {
    format: 'raw' | 'friendly'
    bounceable: boolean | null
    testOnly: boolean | null
    urlSafe: boolean | null
  }
}

function forms(a: Address, testOnly: boolean): NetworkForms {
  const f = (bounceable: boolean): FriendlyForms => ({
    urlSafe: a.toString({ bounceable, testOnly, urlSafe: true }),
    standard: a.toString({ bounceable, testOnly, urlSafe: false })
  })
  return { bounceable: f(true), nonBounceable: f(false) }
}

/** Converts any TON address form into all others. Throws Error with a user-facing message. */
export function convertAddress(input: string): AddressConversion {
  const value = input.trim()
  if (!value) throw new Error('Enter an address')

  let address: Address
  let meta: AddressConversion['input']
  if (Address.isRaw(value)) {
    address = Address.parseRaw(value)
    meta = { format: 'raw', bounceable: null, testOnly: null, urlSafe: null }
  }
  else if (Address.isFriendly(value)) {
    const parsed = Address.parseFriendly(value)
    address = parsed.address
    const hasUrl = /[-_]/.test(value)
    const hasStd = /[+/]/.test(value)
    meta = {
      format: 'friendly',
      bounceable: parsed.isBounceable,
      testOnly: parsed.isTestOnly,
      // Neither character present: the string is valid in both alphabets.
      urlSafe: hasUrl ? true : hasStd ? false : null
    }
  }
  else {
    throw new Error('Not a TON address. Expected raw (0:<64 hex>) or user-friendly (48 base64 characters).')
  }

  return {
    workchain: address.workChain,
    hashHex: address.hash.toString('hex'),
    raw: address.toRawString(),
    mainnet: forms(address, false),
    testnet: forms(address, true),
    input: meta
  }
}
