<script setup lang="ts">
import type { Cell } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { parseRoots, treeStats } from '~/lib/boc-basics/boc'
import { COMMENT_BODY_BOC, PROOF_BOC_HEX, TX1_BOC } from '~/lib/boc-basics/vectors'
import CellNode from './CellNode.vue'
import { KIND_LABEL, describeCell, dumpLines, fiftDump, parentCounts, subCellBoc } from './logic'

const EXAMPLES = [
  { label: 'Transaction', value: TX1_BOC },
  { label: 'Merkle proof', value: PROOF_BOC_HEX },
  { label: 'Comment body', value: COMMENT_BODY_BOC }
]

const input = ref('')

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    const roots = markRaw(parseRoots(input.value))
    return { ok: true as const, roots, counts: parentCounts(roots), stats: treeStats(roots) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const data = computed(() => (result.value?.ok ? result.value : null))

const selectedPath = ref('')
const selectedCell = shallowRef<Cell | null>(null)
provide('cellTreeSelected', selectedPath)
provide('cellTreeSelect', (path: string, cell: Cell) => {
  selectedPath.value = path
  selectedCell.value = markRaw(cell)
})
watch(data, (d) => {
  selectedPath.value = d ? '0' : ''
  selectedCell.value = d ? markRaw(d.roots[0]!) : null
}, { immediate: true })

const detail = computed(() => (selectedCell.value ? describeCell(selectedCell.value) : null))
const detailItems = computed<KeyValueItem[]>(() => {
  const d = detail.value
  if (!d) return []
  const shared = data.value?.counts.get(d.hash) ?? 0
  return [
    { label: 'Type', value: `${KIND_LABEL[d.kind]}${shared > 1 ? `, shared by ${shared} parent cells (stored once in the BOC)` : ''}`, mono: false, copy: false },
    { label: 'Size', value: `${d.bits} bit${d.bits === 1 ? '' : 's'}, ${d.refs} ref${d.refs === 1 ? '' : 's'}`, copy: false, hint: `A cell holds up to 1023 bits and 4 refs.` },
    { label: 'Level / mask / depth', value: `${d.level} / ${d.levelMask} / ${d.depth}`, copy: false },
    { label: 'Hash (representation)', value: d.hash },
    ...(d.level > 0 ? d.levels.map(l => ({ label: `Level ${l.level} hash (depth ${l.depth})`, value: l.hash })) : []),
    ...d.exotic.map(f => ({ label: f.label, value: f.value, copy: f.value.length > 10 })),
    { label: 'Data (hex)', value: d.dataHex, hint: 'Fift notation: a trailing _ means the last nibble holds a 1-then-zeros padding tag.' },
    { label: 'Data (binary)', value: d.binary }
  ]
})
const detailBoc = computed(() => (selectedCell.value ? subCellBoc(selectedCell.value) : ''))
// Shared cells repeat in the dump, so cap on printed lines, not distinct cells.
const dump = computed(() => (data.value && dumpLines(data.value.roots) <= 5000 ? fiftDump(data.value.roots) : ''))
</script>

<template>
  <div class="space-y-6">
    <BocInput v-model="input" :examples="EXAMPLES" />

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="data">
      <div class="flex flex-wrap gap-2">
        <UBadge color="neutral" variant="subtle" :label="`${data.roots.length} root${data.roots.length > 1 ? 's' : ''}`" />
        <UBadge color="neutral" variant="subtle" :label="`${data.stats.cells} distinct cells`" />
        <UBadge color="neutral" variant="subtle" :label="`${data.stats.bits.toLocaleString('en-US')} data bits`" />
        <UBadge color="neutral" variant="subtle" :label="`depth ${data.stats.depth}`" />
        <UBadge v-if="data.stats.exotic" color="warning" variant="subtle" :label="`${data.stats.exotic} exotic`" />
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div class="min-w-0">
          <h3 class="mb-2 font-display text-sm font-semibold text-highlighted">
            Tree
          </h3>
          <p class="mb-2 text-xs text-dimmed">
            Click a cell to inspect it. b = bits, r = refs. Shared cells appear under every parent.
          </p>
          <ul class="max-h-[32rem] overflow-auto rounded-lg border border-default p-2">
            <CellNode
              v-for="(r, i) in data.roots"
              :key="i"
              :cell="r"
              :path="String(i)"
              :label="data.roots.length > 1 ? `root ${i}` : 'root'"
              :depth="0"
              :counts="data.counts"
            />
          </ul>
        </div>

        <div v-if="detail" class="min-w-0">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h3 class="font-display text-sm font-semibold text-highlighted">
              Cell {{ selectedPath.replace(/^(\d+)/, 'root $1').replace(/\./g, ' › ') }}
            </h3>
            <CopyButton :value="detailBoc" label="Copy as BOC" size="xs" />
          </div>
          <KeyValue :items="detailItems" />
        </div>
      </div>

      <details v-if="dump" class="rounded-lg border border-default p-3">
        <summary class="cursor-pointer text-sm font-medium text-highlighted">
          Fift-style text dump
        </summary>
        <div class="mt-2 flex justify-end">
          <CopyButton :value="dump" label="Copy" size="xs" />
        </div>
        <pre class="mt-1 max-h-96 overflow-auto font-mono text-xs whitespace-pre text-muted">{{ dump }}</pre>
      </details>
    </template>
  </div>
</template>
