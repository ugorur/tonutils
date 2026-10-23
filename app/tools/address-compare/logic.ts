import { Address } from '@ton/core'

export interface ParsedSide {
  address: Address
  format: 'raw' | 'friendly'
  bounceable: boolean | null
  testOnly: boolean | null
}

export interface CharDiff {
  char: string
  same: boolean
}

export interface CompareResult {
  /** Same workchain and account hash: funds go to the same place. */
  same: boolean
  a: ParsedSide
  b: ParsedSide
  /** Both written in one common form (A's flags), so the characters can be compared one by one. */
  shownA: string
  shownB: string
  diffA: CharDiff[]
  diffB: CharDiff[]
  differing: number
  /** Look-alike verdict for different accounts. */
  risk: 'none' | 'lookalike' | 'similar'
  /** Longest matching start / end (in characters, flag characters included) over the user-friendly forms. */
  prefix: number
  suffix: number
  /** Same account, but the two strings carry different flags. */
  flagNotes: string[]
}

export function parseSide(value: string, which: string): ParsedSide {
  const s = value.trim()
  if (!s) throw new Error(`Enter address ${which}`)
  let p: ParsedSide | null = null
  try {
    if (Address.isRaw(s)) p = { address: Address.parseRaw(s), format: 'raw', bounceable: null, testOnly: null }
    else if (Address.isFriendly(s)) {
      const f = Address.parseFriendly(s)
      p = { address: f.address, format: 'friendly', bounceable: f.isBounceable, testOnly: f.isTestOnly }
    }
  }
  catch { /* handled below */ }
  if (p && p.address.workChain !== 0 && p.address.workChain !== -1) throw new Error(`Address ${which} is on workchain ${p.address.workChain}, which does not exist. TON uses 0 (basechain) and -1 (masterchain).`)
  if (!p) throw new Error(`Address ${which} is not a valid TON address (wrong length, character or checksum).`)
  return p
}

function common(a: string, b: string, fromEnd = false): number {
  let n = 0
  const len = Math.min(a.length, b.length)
  while (n < len && (fromEnd ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])) n++
  return n
}

/**
 * Wallets usually show the first and last 4 characters ("UQCD…qEBI"). Address poisoning creates an
 * address that matches those and sends a tiny transfer so it lands in your history. The first 2
 * characters are flags (EQ/UQ/kQ/0Q) and always match, and the 3rd carries only 2 bits for workchain 0,
 * so a 4 + 4 match is about 32 bits: unrelated addresses practically never share it, so it is deliberate.
 * `prefix` and `suffix` count characters of the full string, flags included.
 */
export function lookalikeRisk(prefix: number, suffix: number): CompareResult['risk'] {
  if (prefix >= 4 && suffix >= 4) return 'lookalike'
  if (Math.max(0, prefix - 2) + suffix >= 4) return 'similar'
  return 'none'
}

function show(p: ParsedSide, like: ParsedSide): string {
  if (like.format === 'raw') return p.address.toRawString()
  return p.address.toString({ bounceable: like.bounceable ?? true, testOnly: like.testOnly ?? false, urlSafe: true })
}

function diff(x: string, y: string): CharDiff[] {
  return [...x].map((char, i) => ({ char, same: char === y[i] }))
}

export function compareAddresses(inputA: string, inputB: string): CompareResult {
  const a = parseSide(inputA, 'A')
  const b = parseSide(inputB, 'B')
  const same = a.address.equals(b.address)
  const shownA = show(a, a)
  const shownB = show(b, a)

  let prefix = 0
  let suffix = 0
  if (!same) {
    // Compare the forms a wallet might display, both with the same flags (the checksum at the end depends on them).
    for (const bounceable of [true, false]) {
      for (const testOnly of [false, true]) {
        const x = a.address.toString({ bounceable, testOnly, urlSafe: true })
        const y = b.address.toString({ bounceable, testOnly, urlSafe: true })
        prefix = Math.max(prefix, common(x, y))
        suffix = Math.max(suffix, common(x, y, true))
      }
    }
  }

  const flagNotes: string[] = []
  if (same) {
    if (a.format !== b.format) flagNotes.push('One is written in raw form (0:…), the other in user-friendly form.')
    if (a.bounceable !== null && b.bounceable !== null && a.bounceable !== b.bounceable) {
      flagNotes.push('One is bounceable (EQ/kQ), the other non-bounceable (UQ/0Q). Same account; only the bounce behaviour of transfers differs.')
    }
    if (a.testOnly !== null && b.testOnly !== null && a.testOnly !== b.testOnly) {
      flagNotes.push('One is written in testnet form (kQ/0Q). The account id is identical, but check which network the sender meant.')
    }
  }

  const diffA = diff(shownA, shownB)
  return {
    same,
    a,
    b,
    shownA,
    shownB,
    diffA,
    diffB: diff(shownB, shownA),
    differing: diffA.filter(d => !d.same).length,
    risk: same ? 'none' : lookalikeRisk(prefix, suffix),
    prefix,
    suffix,
    flagNotes
  }
}
