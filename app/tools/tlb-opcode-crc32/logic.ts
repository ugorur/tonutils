import { opcodeInfo, opHex, type OpcodeInfo } from '~/utils/ton/opcodes'

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

/** CRC-32/ISO-HDLC (zlib, IEEE 802.3) of the UTF-8 bytes. */
export function crc32(text: string): number {
  let c = 0xffffffff
  for (const b of new TextEncoder().encode(text)) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ConstructorTag {
  /** Constructor name as written (`transfer`, `_` …). */
  name: string
  /** Explicit tag from the source, e.g. `#0f8a7ea5` or `$10`; null when none. */
  explicit: string | null
  /** The text CRC32 is computed over (tlbc canonical form). */
  normalized: string
  /** crc32(normalized): the implicit tag tlbc assigns to a named constructor without one. */
  crc: number
  /** crc & 0x7fffffff: the TEP-74 style op (top bit cleared), e.g. 0x0f8a7ea5. */
  masked: number
  /** crc | 0x80000000. */
  topBit: number
  /** Explicit 32-bit #tag value, when the source has one. */
  explicitValue: number | null
  /** Which of crc / masked / topBit the explicit tag equals. */
  explicitMatches: ('crc' | 'masked' | 'topBit')[]
  /** Known op codes (shared op code list) equal to any variant. */
  known: { variant: 'explicit' | 'crc' | 'masked' | 'topBit', info: OpcodeInfo }[]
}

function stripComments(src: string) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/**
 * Canonical text tlbc hashes (Constructor::show with mode 10, crypto/tl/tlbc.cpp): tag, braces, parentheses
 * and the trailing ';' are dropped, whitespace collapsed to single spaces, `^` and `:` glued to their operands.
 * ponytail: text-based, so it matches tlbc for ordinary field lists (all TEP message bodies); exotic forms tlbc
 * rewrites (`{a <= b}` constraints, `2 * n` reordering, `~` in result args) may differ.
 */
export function normalize(decl: string): { name: string, explicit: string | null, normalized: string } {
  const text = stripComments(decl).replace(/;\s*$/, '').trim()
  const m = /^([A-Za-z_][\w]*)(#[0-9a-fA-F]*_?|\$[01]*_?)?(?=\s|$)/.exec(text)
  if (!m) throw new Error('Start with a constructor name, e.g. transfer query_id:uint64 … = InternalMsgBody')
  // the last bare '=' separates fields from the type; earlier ones belong to {n = m + 1} constraints
  const eq = [...text.matchAll(/(?<![<>=!])=(?!=)/g)].pop()?.index ?? -1
  if (eq < 0) throw new Error('A constructor needs "= TypeName" at the end')
  const body = (s: string) => s.replace(/[(){}]/g, ' ').replace(/\s+/g, ' ').replace(/\^ /g, '^').replace(/ ?: ?/g, ':').trim()
  const fields = body(text.slice(m[0].length, eq))
  const type = body(text.slice(eq + 1))
  if (!type) throw new Error('Missing the type name after "="')
  return { name: m[1]!, explicit: m[2] ?? null, normalized: [m[1], fields, '=', type].filter(Boolean).join(' ') }
}

export function constructorTag(decl: string): ConstructorTag {
  const { name, explicit, normalized } = normalize(decl)
  if (name === '_') throw new Error('Anonymous constructors (_) have no tag: give the constructor a name')
  const crc = crc32(normalized)
  const masked = (crc & 0x7fffffff) >>> 0
  const topBit = (crc | 0x80000000) >>> 0
  const hex = explicit?.startsWith('#') ? explicit.slice(1).replace(/_$/, '') : ''
  const explicitValue = hex.length === 8 ? Number.parseInt(hex, 16) >>> 0 : null
  const explicitMatches = explicitValue === null
    ? []
    : (['crc', 'masked', 'topBit'] as const).filter(k => ({ crc, masked, topBit })[k] === explicitValue)
  const known: ConstructorTag['known'] = []
  const variants = [['explicit', explicitValue], ['crc', crc], ['masked', masked], ['topBit', topBit]] as const
  const seen = new Set<number>()
  for (const [variant, v] of variants) {
    if (v === null || seen.has(v)) continue
    seen.add(v)
    const info = opcodeInfo(v)
    if (info) known.push({ variant, info })
  }
  return { name, explicit, normalized, crc, masked, topBit, explicitValue, explicitMatches, known }
}

/** Every declaration in a schema (split on ';'). Lines that fail to parse come back with an error. */
export function schemaTags(schema: string): ({ source: string } & ({ tag: ConstructorTag } | { error: string }))[] {
  return stripComments(schema)
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map((source) => {
      try {
        return { source, tag: constructorTag(source) }
      }
      catch (e) {
        return { source, error: (e as Error).message }
      }
    })
}

/** snake_case → constant names for contract code. */
export function constants(name: string, op: number) {
  const hex = opHex(op)
  const upper = name.replace(/[^\w]/g, '_').toUpperCase()
  const camel = name.replace(/(^|_)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase())
  return {
    tolk: `const OP_${upper} = ${hex};`,
    func: `const int op::${name} = ${hex};`,
    tact: `const Op${camel}: Int = ${hex};`
  }
}
