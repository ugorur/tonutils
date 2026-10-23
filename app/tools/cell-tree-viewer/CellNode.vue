<script setup lang="ts">
import type { Cell } from '@ton/core'
import type { Ref } from 'vue'
import { CellType } from '@ton/core'
import { KIND_LABEL, describeCell } from './logic'

const props = defineProps<{
  cell: Cell
  path: string
  label: string
  depth: number
  counts: Map<string, number>
}>()

const selected = inject<Ref<string>>('cellTreeSelected')!
const select = inject<(path: string, cell: Cell) => void>('cellTreeSelect')!

// Children render only when expanded, so huge BOCs stay fast.
const open = ref(props.depth < 2)
const hash = computed(() => props.cell.hash().toString('hex'))
const shared = computed(() => props.counts.get(hash.value) ?? 0)
const kind = computed(() => (props.cell.type === CellType.Ordinary ? null : KIND_LABEL[describeCell(props.cell).kind]))
const preview = computed(() => {
  const b = props.cell.bits
  return b.length ? b.substring(0, Math.min(b.length, 96)).toString() + (b.length > 96 ? '…' : '') : 'empty'
})
</script>

<template>
  <li>
    <div
      class="flex min-w-0 items-center gap-1 rounded-md py-0.5 pr-2 text-xs"
      :class="selected === path ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-elevated'"
    >
      <UButton
        v-if="cell.refs.length"
        :icon="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="open ? 'Collapse' : 'Expand'"
        :aria-expanded="open"
        @click="open = !open"
      />
      <span v-else class="inline-block w-6 shrink-0" />
      <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="select(path, cell)">
        <span class="shrink-0 font-medium text-highlighted">{{ label }}</span>
        <UBadge v-if="kind" :label="kind" color="warning" variant="subtle" size="sm" class="shrink-0" />
        <UBadge v-if="shared > 1" :label="`shared ×${shared}`" color="info" variant="subtle" size="sm" class="shrink-0" />
        <span class="shrink-0 text-dimmed">{{ cell.bits.length }}b{{ cell.refs.length ? ` · ${cell.refs.length}r` : '' }}</span>
        <span class="min-w-0 truncate font-mono text-muted">{{ preview }}</span>
      </button>
    </div>
    <ul v-if="open && cell.refs.length" class="ml-3 border-l border-default pl-2">
      <CellNode
        v-for="(r, i) in cell.refs"
        :key="i"
        :cell="r"
        :path="`${path}.${i}`"
        :label="`ref ${i}`"
        :depth="depth + 1"
        :counts="counts"
      />
    </ul>
  </li>
</template>
