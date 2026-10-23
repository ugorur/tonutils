<script setup lang="ts">
import type { TupleItem } from '@ton/core'
import { ELECTIONS_V3, JETTON_DATA_V2 } from './examples'
import type { ArgRow, ArgType, ReadableItem, StackFormat } from './logic'
import { argsToItems, convertAll, FORMAT_LABELS, parseStack, readable } from './logic'

const { isTestnet } = useTonNetwork()
const mode = ref<'convert' | 'args'>('convert')

// ---------------------------------------------------------------- convert
const input = ref('')
const format = ref<StackFormat | 'auto'>('auto')
const formatItems = [{ label: 'Auto-detect', value: 'auto' }, ...Object.entries(FORMAT_LABELS).map(([value, label]) => ({ label, value }))]

const EXAMPLES = [
  { label: 'get_jetton_data (toncenter v2)', text: () => JSON.stringify({ ok: true, result: { gas_used: 3215, stack: JETTON_DATA_V2, exit_code: 0 } }, null, 2) },
  { label: 'past_election_ids list (toncenter v3)', text: () => JSON.stringify({ gas_used: 4040, exit_code: 0, stack: ELECTIONS_V3 }, null, 2) }
]
function loadExample(i: number) {
  format.value = 'auto'
  input.value = EXAMPLES[i]!.text()
}

const parsed = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: parseStack(input.value, format.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

// ---------------------------------------------------------------- args
const ARG_TYPES: { label: string, value: ArgType }[] = [
  { label: 'Integer', value: 'int' },
  { label: 'Address', value: 'address' },
  { label: 'Cell (BOC)', value: 'cell' },
  { label: 'Slice (BOC)', value: 'slice' },
  { label: 'Null', value: 'null' }
]
const PLACEHOLDERS: Record<ArgType, string> = { int: '42, -1 or 0x2a', address: 'UQ… / EQ… / 0:…', cell: 'te6cc… or b5ee9c72…', slice: 'te6cc… or b5ee9c72…', null: '' }
const args = ref<ArgRow[]>([{ type: 'address', value: '' }])
function argsExample() {
  // get_wallet_address(owner) on a jetton master
  args.value = [{ type: 'address', value: 'UQARdqETVZjzwzP-t1YekVJ7sdRXUuMPZ7ERBAhtjhEI29IK' }]
}

const built = computed(() => {
  if (!args.value.length || args.value.some(a => a.type !== 'null' && !a.value.trim())) return null
  try {
    return { ok: true as const, items: argsToItems(args.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

// ---------------------------------------------------------------- output
const items = computed<TupleItem[] | null>(() => mode.value === 'convert'
  ? (parsed.value?.ok ? parsed.value.data.items : null)
  : (built.value?.ok ? built.value.items : null))

const outputs = computed(() => items.value ? convertAll(items.value) : null)
const OUTPUT_ITEMS = [
  { value: 'toncenter-v3', label: 'toncenter v3 result', hint: 'The "stack" field of /api/v3/runGetMethod responses.' },
  { value: 'toncenter-v3-input', label: 'toncenter v3 arguments', hint: 'The "stack" you POST to /api/v3/runGetMethod (int, cell and slice only).' },
  { value: 'toncenter-v2', label: 'toncenter v2 result', hint: 'The "stack" field of /api/v2/runGetMethod responses.' },
  { value: 'toncenter-v2-input', label: 'toncenter v2 arguments', hint: 'The "stack" you POST to /api/v2/runGetMethod.' },
  { value: 'tonapi', label: 'tonapi result', hint: 'The "stack" field of GET /v2/blockchain/accounts/{id}/methods/{name}.' },
  { value: 'tonapi-args', label: 'tonapi arguments', hint: 'Body for POST /v2/blockchain/accounts/{id}/methods/{name}.' },
  { value: 'core', label: '@ton/core JSON', hint: 'TupleItem[] (ints as decimal strings, cells as base64), for TupleReader / serializeTuple.' },
  { value: 'boc', label: 'VmStack BOC', hint: 'serializeTuple(items): the TL-B VmStack, base64. What emulators and tonlib exchange.' }
] as const
type OutputKey = typeof OUTPUT_ITEMS[number]['value']
const outKey = ref<OutputKey>('toncenter-v3')
watch(mode, (m) => {
  outKey.value = m === 'args' ? 'toncenter-v3-input' : outKey.value
})
const current = computed(() => outputs.value?.[outKey.value])
const currentHint = computed(() => OUTPUT_ITEMS.find(o => o.value === outKey.value)?.hint)

// flattened readable tree
const rows = computed(() => {
  if (!items.value) return []
  const out: (ReadableItem & { depth: number })[] = []
  const walk = (list: ReadableItem[], depth: number) => list.forEach((r) => {
    out.push({ ...r, depth })
    if (r.children) walk(r.children, depth + 1)
  })
  walk(readable(items.value, isTestnet.value), 0)
  return out
})
const columns = [
  { accessorKey: 'index', header: '#' },
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'value', header: 'Value' }
]
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'Convert a stack', value: 'convert', icon: 'i-lucide-arrow-left-right' }, { label: 'Build arguments', value: 'args', icon: 'i-lucide-list-plus' }]"
      class="w-full"
    />

    <template v-if="mode === 'convert'">
      <div class="space-y-2">
        <UFormField label="Stack" description="A stack array, a whole get-method response from toncenter or tonapi, a tonapi {&quot;args&quot;: […]} body, or a VmStack BOC.">
          <UTextarea v-model="input" :rows="5" autoresize :maxrows="14" class="w-full font-mono" placeholder="[[&quot;num&quot;, &quot;0x1&quot;]] or {&quot;stack&quot;: […]} or te6cc…" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-x-4">
          <UButton v-for="(ex, i) in EXAMPLES" :key="ex.label" :label="`Example: ${ex.label}`" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="loadExample(i)" />
          <UButton v-if="input" label="Clear" icon="i-lucide-eraser" variant="link" color="neutral" size="sm" class="px-0" @click="input = ''" />
        </div>
      </div>
      <UFormField label="Input format">
        <USelect v-model="format" :items="formatItems" class="w-full sm:w-96" />
      </UFormField>
      <UAlert v-if="parsed && !parsed.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="Could not read the stack" :description="parsed.error" />
      <p v-if="parsed?.ok" class="text-sm text-muted">
        Read as <span class="font-medium text-highlighted">{{ FORMAT_LABELS[parsed.data.format] }}</span>, {{ parsed.data.items.length }} item(s).
      </p>
    </template>

    <template v-else>
      <p class="text-sm text-muted">
        Arguments in the order the get-method takes them. Addresses become slices; integers may be decimal or 0x-hex.
      </p>
      <div class="space-y-2">
        <div v-for="(a, i) in args" :key="i" class="flex flex-wrap items-start gap-2 sm:flex-nowrap">
          <USelect v-model="a.type" :items="ARG_TYPES" class="w-36 shrink-0" :aria-label="`Argument ${i + 1} type`" />
          <UInput v-if="a.type !== 'null'" v-model="a.value" class="min-w-0 flex-1 basis-48 font-mono" :placeholder="PLACEHOLDERS[a.type]" :aria-label="`Argument ${i + 1} value`" />
          <span v-else class="flex-1 py-1.5 text-sm text-muted">null</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Remove argument ${i + 1}`" @click="args.splice(i, 1)" />
        </div>
        <div class="flex flex-wrap items-center gap-x-4">
          <UButton label="Add argument" icon="i-lucide-plus" color="neutral" variant="outline" size="sm" @click="args.push({ type: 'int', value: '' })" />
          <UButton label="Example: get_wallet_address(owner)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="argsExample" />
        </div>
      </div>
      <UAlert v-if="built && !built.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />
    </template>

    <template v-if="items && outputs">
      <div class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Stack
        </h3>
        <UTable :data="rows" :columns="columns" class="max-h-[28rem] rounded-md border border-default" :ui="{ td: 'align-top text-xs whitespace-normal break-all', th: 'text-xs' }">
          <template #index-cell="{ row }">
            <span class="font-mono text-muted" :style="{ paddingLeft: `${row.original.depth * 0.75}rem` }">{{ row.original.index }}</span>
          </template>
          <template #type-cell="{ row }">
            <span class="whitespace-nowrap">{{ row.original.type }}</span>
          </template>
          <template #value-cell="{ row }">
            <div class="flex items-start gap-1">
              <div class="min-w-0 flex-1">
                <div class="font-mono">
                  {{ row.original.value }}
                </div>
                <div v-if="row.original.extra" class="mt-0.5 font-mono text-dimmed">
                  {{ row.original.extra }}
                </div>
              </div>
              <CopyButton v-if="row.original.value && row.original.value !== 'null'" :value="row.original.value" size="xs" class="shrink-0" />
            </div>
          </template>
          <template #empty>
            <span class="text-sm text-muted">Empty stack.</span>
          </template>
        </UTable>
      </div>

      <div class="space-y-2">
        <UFormField label="Output format" :description="currentHint">
          <USelect v-model="outKey" :items="OUTPUT_ITEMS.map(o => ({ label: o.label, value: o.value }))" class="w-full sm:w-96" />
        </UFormField>
        <UAlert v-if="current && !current.ok" color="warning" variant="subtle" icon="i-lucide-info" :title="current.error" />
        <div v-else-if="current" class="overflow-hidden rounded-md border border-default bg-muted">
          <div class="flex items-center justify-between border-b border-default px-3 py-1.5">
            <span class="text-xs text-muted">{{ OUTPUT_ITEMS.find(o => o.value === outKey)?.label }}</span>
            <CopyButton :value="current.text" size="xs" />
          </div>
          <pre class="max-h-[28rem] overflow-auto p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-default">{{ current.text }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>
