<script setup lang="ts">
import type { DroppedFile } from '~/components/FileDrop.vue'
import { convertBatch, convertedList, csvRows, OUTPUT_FORMATS, type OutputFormat } from './logic'

// Real mainnet accounts (TON Foundation wallet, USD₮ master, tolya.ton) plus a header, a duplicate and a typo.
const EXAMPLE = [
  'address,amount',
  'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI,10',
  'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs,25',
  '0:9da971af38d2f03abdf308d5f91636a97e5a2b07a66c39d71d7cbae3b032eddc,5',
  'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N,10',
  'UQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_p0X,1'
].join('\n')

const text = ref('')
const format = ref<OutputFormat>('nonBounceable')
const filter = ref<'all' | 'problems'>('all')

const result = computed(() => {
  if (!text.value.trim()) return null
  try {
    return { ok: true as const, data: convertBatch(text.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

const data = computed(() => result.value?.ok ? result.value.data : null)
const shown = computed(() => {
  const rows = data.value?.rows ?? []
  return (filter.value === 'problems' ? rows.filter(r => r.status !== 'ok') : rows).slice(0, 500)
})
const list = computed(() => data.value ? convertedList(data.value.rows, format.value) : '')
const exportRows = computed(() => data.value ? csvRows(data.value.rows) : [])

const columns = [
  { accessorKey: 'line', header: '#' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'out', header: 'Converted / original line' }
]

const STATUS = {
  ok: { label: 'OK', color: 'success' },
  duplicate: { label: 'Duplicate', color: 'warning' },
  invalid: { label: 'Invalid', color: 'error' }
} as const

function onFile(f: DroppedFile) {
  text.value = f.text ?? ''
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="Addresses" hint="One per line, or a CSV/TSV (first address field per row is used)">
        <UTextarea
          v-model="text"
          :rows="8"
          autoresize
          :maxrows="16"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="UQ…, EQ…, 0:…  one per line, or address,amount rows"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="text = EXAMPLE" />
        <UButton v-if="text" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="text = ''" />
      </div>
      <FileDrop v-if="!text" accept=".csv,.txt,.tsv,text/plain,text/csv" text :max-bytes="5 * 1024 * 1024" label="Or drop a .csv / .txt file" @file="onFile" />
    </div>

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="data">
      <div class="flex flex-wrap gap-2">
        <UBadge color="success" variant="subtle" :label="`${data.valid} unique valid`" />
        <UBadge v-if="data.duplicates" color="warning" variant="subtle" :label="`${data.duplicates} duplicate${data.duplicates > 1 ? 's' : ''}`" />
        <UBadge v-if="data.invalid" color="error" variant="subtle" :label="`${data.invalid} invalid`" />
      </div>

      <UAlert
        v-if="data.masterchain || data.testOnly"
        color="warning"
        variant="subtle"
        icon="i-lucide-info"
        title="Check these before sending"
        :description="[
          data.masterchain ? `${data.masterchain} address(es) are on the masterchain (-1:…). Regular wallets live on workchain 0.` : '',
          data.testOnly ? `${data.testOnly} address(es) were written in testnet form (kQ/0Q). The account is the same on mainnet, but the sender may have meant testnet.` : ''
        ].filter(Boolean).join(' ')"
      />

      <div class="space-y-3">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <UFormField label="Output format" class="sm:w-80">
            <USelect v-model="format" :items="OUTPUT_FORMATS" class="w-full" />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <CopyButton :value="list" label="Copy list" size="sm" />
            <CsvExportButton :rows="exportRows" filename="ton-addresses" label="CSV with all forms" />
          </div>
        </div>
        <p class="text-xs text-dimmed">
          The copied list has one address per line: valid rows only, duplicates removed, in the original order. The CSV keeps every row with its status.
        </p>
      </div>

      <div>
        <UTabs
          v-model="filter"
          :content="false"
          :items="[{ label: `All rows (${data.rows.length})`, value: 'all' }, { label: `Problems (${data.invalid + data.duplicates})`, value: 'problems' }]"
          variant="link"
          size="sm"
          class="w-full"
        />
        <UTable :data="shown" :columns="columns" class="mt-2 max-h-[32rem]" sticky :ui="{ td: 'py-2 align-top whitespace-normal', th: 'py-2' }">
          <template #status-cell="{ row }">
            <UBadge :color="STATUS[row.original.status].color" variant="subtle" size="sm" :label="STATUS[row.original.status].label" />
          </template>
          <template #out-cell="{ row }">
            <div v-if="row.original.status !== 'invalid'" class="flex items-center gap-1">
              <span class="font-mono text-xs break-all">{{ row.original[format] }}</span>
              <CopyButton :value="row.original[format] ?? ''" size="xs" />
            </div>
            <span v-else class="text-xs text-error">{{ row.original.note }}</span>
            <div v-if="row.original.status === 'duplicate'" class="text-xs text-warning">
              {{ row.original.note }}
            </div>
            <div class="mt-0.5 font-mono text-xs break-all text-dimmed">
              {{ row.original.input }}
            </div>
          </template>
          <template #empty>
            <span class="text-sm text-muted">No problems found.</span>
          </template>
        </UTable>
        <p v-if="data.rows.length > 500" class="mt-2 text-xs text-dimmed">
          Showing the first 500 rows. Copy or export to get all {{ data.rows.length }}.
        </p>
      </div>
    </template>
  </div>
</template>
