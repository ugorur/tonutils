import type { Cell } from '@ton/core'
import { loadMessage } from '@ton/core'
import { parseRoots } from '~/lib/boc-basics/boc'
import { decodeBody, normalizedExtMessageHash } from '~/utils/ton/messages'

export type MessageReport =
  | {
    kind: 'external-in' | 'internal' | 'external-out'
    /** Hash of the whole message cell (hex): toncenter `in_msg.hash`. */
    hash: string
    /** TEP-467 normalized hash (hex), external-in only: toncenter `hash_norm`. */
    normalizedHash: string | null
    /** Hash of the body cell (hex): toncenter `message_content.hash`. */
    bodyHash: string
    bodyOp: { opHex: string | null, title: string }
    bodyInline: boolean
    src: string | null
    dest: string | null
    /** nanoGRAM, internal messages only. */
    value: bigint | null
    bounce: boolean | null
    hasInit: boolean
  }
  | {
    /** Parsed as a cell, but not a Message: probably a bare body. */
    kind: 'not-a-message'
    hash: string
    bodyOp: { opHex: string | null, title: string }
  }

const hex = (c: Cell) => c.hash().toString('hex')

function op(body: Cell) {
  const d = decodeBody(body)
  return { opHex: d.opHex, title: d.title }
}

/** Parses a message BOC (base64/hex) and computes every hash explorers and APIs use. Throws on invalid BOC. */
export function analyzeMessage(input: string): MessageReport {
  const root = parseRoots(input)[0]!
  let msg: ReturnType<typeof loadMessage>
  try {
    msg = loadMessage(root.beginParse())
  }
  catch {
    return { kind: 'not-a-message', hash: hex(root), bodyOp: op(root) }
  }
  const info = msg.info
  return {
    kind: info.type,
    hash: hex(root),
    normalizedHash: info.type === 'external-in' ? normalizedExtMessageHash(root) : null,
    bodyHash: hex(msg.body),
    bodyOp: op(msg.body),
    bodyInline: !root.refs.includes(msg.body),
    src: info.src ? info.src.toString() : null,
    dest: info.dest ? info.dest.toString() : null,
    value: info.type === 'internal' ? info.value.coins : null,
    bounce: info.type === 'internal' ? info.bounce : null,
    hasInit: !!msg.init
  }
}

/** The hash to search toncenter's transactionsByMessage with: normalized for external-in (stable across resends), else the full hash. */
export function lookupHash(r: MessageReport): string {
  return r.kind === 'external-in' ? (r.normalizedHash ?? r.hash) : r.hash
}
