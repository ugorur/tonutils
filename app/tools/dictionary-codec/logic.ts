import type { Cell } from '@ton/core'
import { parseCell } from '~/lib/boc-advanced/cells'
import type { DictEntry, DictLayout } from '~/lib/boc-advanced/dict'
import { dictEntries, dictFromJson, entriesToJson, loadDict, parseSchema, storeDictLayouts } from '~/lib/boc-advanced/dict'

export interface DecodedDict {
  layout: Exclude<DictLayout, 'auto'>
  entries: DictEntry[]
  /** Round-trippable JSON for the builder. */
  json: string
  /** Hash of the Hashmap root cell (what a Merkle proof commits to); null for an empty dict. */
  rootHash: string | null
  warnings: number
}

export function decodeDictionary(boc: string, keySpec: string, valueSpec: string, layout: DictLayout, testOnly = false): DecodedDict {
  const schema = parseSchema(keySpec, valueSpec)
  const cell = parseCell(boc)
  const { dict, layout: used } = loadDict(cell, schema, layout)
  const entries = dictEntries(dict, schema, testOnly)
  const root: Cell | null = used === 'direct' ? cell : cell.refs[0] ?? null
  return {
    layout: used,
    entries,
    json: entriesToJson(entries),
    rootHash: root ? root.hash().toString('hex') : null,
    warnings: entries.filter(e => e.warning).length
  }
}

export function buildDictionary(json: string, keySpec: string, valueSpec: string) {
  const schema = parseSchema(keySpec, valueSpec)
  const dict = dictFromJson(json, schema)
  return { count: dict.size, ...storeDictLayouts(dict) }
}
