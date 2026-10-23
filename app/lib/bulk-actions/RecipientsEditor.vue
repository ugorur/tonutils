<script setup lang="ts">
import type { Address } from '@ton/core'
import type { DroppedFile } from '~/components/FileDrop.vue'
import { useAccountClients } from '~/lib/accounts/api'
import type { Purpose, TonapiAccount } from '~/lib/wallet-actions/core'
import { chunk } from '~/lib/wallet-actions/core'
import type { CheckedRow } from './recipients'
import { checkRows, missingAccounts, parseRecipientsCsv, totals } from './recipients'

// Recipient list for the bulk senders: paste or drop a CSV, every address is checked with tonapi
// (100 per request, cached), and each row gets a status. Emits the checked rows. Client-only (@ton/core).
const text = defineModel<string>({ default: '' })
const props = defineProps<{
  purpose: Purpose
  /** Decimals of the amounts (9 for GRAM, the jetton's otherwise). */
  decimals: number
  unit: string
  self?: Address | null
  example: string
}>()
const emit = defineEmits<{ rows: [rows: CheckedRow[]] }>()


const MAX_ROWS = 1000
const { isTestnet, network } = useTonNetwork()
const clients = useAccountClients(network)

const defaultText = ref('')
const defaultAmount = computed(() => {
  try {
    return defaultText.value.trim() ? parseUnits(defaultText.value, props.decimals) : null
  }
  catch {
    return null
  }
})

const parsed = computed(() => parseRecipientsCsv(text.value, { decimals: props.decimals, defaultAmount: defaultAmount.value }))
const tooMany = computed(() => parsed.value.length > MAX_ROWS)

const accounts = shallowRef(new Map<string, TonapiAccount>())
const checking = ref(false)
const progress = ref({ done: 0, total: 0 })
const lookupError = ref<unknown>(null)
let session = 0
let timer: ReturnType<typeof setTimeout> | undefined

async function lookup() {
  const my = ++session
  lookupError.value = null
  const missing = tooMany.value ? [] : missingAccounts(parsed.value, accounts.value)
  if (!missing.length) {
    checking.value = false
    return
  }
  checking.value = true
  progress.value = { done: 0, total: missing.length }
  try {
    for (const batch of chunk(missing, 100)) {
      const r = await clients.tonapiPost<{ accounts: TonapiAccount[] }>('accounts/_bulk', { account_ids: batch })
      if (my !== session) return
      const next = new Map(accounts.value)
      for (const a of r.accounts) next.set(a.address.toLowerCase(), a)
      accounts.value = next
      progress.value = { done: progress.value.done + batch.length, total: missing.length }
    }
  }
  catch (e) {
    if (my === session) lookupError.value = e
  }
  finally {
    if (my === session) checking.value = false
  }
}

watch(parsed, () => {
  clearTimeout(timer)
  timer = setTimeout(lookup, 600)
}, { immediate: true })
watch(network, () => {
  accounts.value = new Map()
  lookup()
})
onBeforeUnmount(() => clearTimeout(timer))

const rows = computed(() => (tooMany.value ? [] : checkRows(parsed.value, accounts.value, { purpose: props.purpose, testnet: isTestnet.value, self: props.self })))
const sum = computed(() => totals(rows.value))
watch(rows, r => emit('rows', r), { immediate: true })

function onFile(f: DroppedFile) {
  text.value = f.text ?? ''
}

const onlyProblems = ref(false)
const shown = computed(() => (onlyProblems.value ? rows.value.filter(r => r.blocked || r.notes.some(n => n.level !== 'info')) : rows.value).slice(0, 300))
const columns = [
  { accessorKey: 'line', header: '#' },
  { accessorKey: 'input', header: 'Recipient' },
  { accessorKey: 'amount', header: 'Amount' },
  { accessorKey: 'status', header: 'Check' }
]
const STATUS_LABEL: Record<string, string> = { active: 'active', uninit: 'not activated', nonexist: 'new', frozen: 'frozen' }

function rowStatus(r: CheckedRow): { color: 'success' | 'warning' | 'error' | 'neutral', label: string } {
  if (r.error) return { color: 'error', label: 'Invalid' }
  if (!r.account) return { color: 'neutral', label: checking.value ? 'Checking…' : 'Not checked' }
  if (r.blocked) return { color: 'error', label: 'Blocked' }
  if (r.notes.some(n => n.level === 'warning')) return { color: 'warning', label: 'Check' }
  return { color: 'success', label: 'Ready' }
}
</script>

<template>
  <div class="space-y-4">
    <UFormField label="Recipients" :hint="`address, amount (${unit}), comment`">
      <UTextarea
        v-model="text"
        :rows="7"
        autoresize
        :maxrows="16"
        class="w-full"
        :ui="{ base: 'font-mono text-xs' }"
        placeholder="UQ…, 1.5, Thanks!&#10;EQ…, 0.25&#10;0:…, 10, Invoice 42"
        spellcheck="false"
        data-testid="recipients-input"
      />
      <template #help>
        One recipient per line. Separators: comma, semicolon or tab. A header line is skipped. Put a comment that contains commas in "double quotes".
      </template>
    </UFormField>

    <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <FileDrop accept=".csv,.txt,.tsv,text/csv,text/plain" text :max-bytes="2 * 1024 * 1024" label="Or drop a CSV file here (read in your browser, never uploaded)" @file="onFile" />
      <div class="flex flex-wrap gap-2">
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="outline" color="neutral" data-testid="try-example" @click="text = example" />
        <UButton v-if="text" label="Clear" icon="i-lucide-x" variant="ghost" color="neutral" @click="text = ''" />
      </div>
    </div>

    <UFormField :label="`Default amount (${unit}, optional)`" hint="Used for lines without an amount">
      <UInput v-model="defaultText" inputmode="decimal" placeholder="e.g. 0.5" class="w-full sm:w-60" data-testid="default-amount" />
    </UFormField>

    <UAlert v-if="tooMany" color="error" variant="subtle" icon="i-lucide-octagon-x" :description="`${parsed.length} recipients: the limit is ${MAX_ROWS} per run. Split the list into several files.`" />

    <template v-if="rows.length">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid="recipients-summary">
        <span><span class="font-semibold text-highlighted">{{ sum.rows }}</span> {{ sum.rows === 1 ? 'recipient' : 'recipients' }}</span>
        <span class="text-success">{{ sum.ready }} ready</span>
        <span v-if="sum.blocked" class="text-error">{{ sum.blocked }} need attention</span>
        <span>Total <span class="font-mono font-semibold text-highlighted">{{ formatAmount(sum.amount, decimals) }} {{ unit }}</span></span>
        <USwitch v-model="onlyProblems" label="Only rows with problems" size="sm" />
      </div>
      <LoadingState v-if="checking" :label="`Checking recipients with tonapi… ${progress.done} / ${progress.total}`" />
      <ErrorNotice v-if="lookupError" :error="lookupError" title="Could not check the recipients" @retry="lookup" />

      <UTable :data="shown" :columns="columns" sticky class="max-h-[30rem] rounded-lg border border-default" :ui="{ td: 'py-2 px-2 sm:px-4 align-top whitespace-normal', th: 'py-2 px-2 sm:px-4' }" data-testid="recipients-table">
        <template #input-cell="{ row }">
          <div class="max-w-44 min-w-0 sm:max-w-80">
            <div class="font-mono text-xs break-all text-highlighted">
              {{ row.original.destination ?? row.original.input }}
            </div>
            <div v-if="row.original.comment" class="mt-0.5 text-xs break-words text-muted">
              “{{ row.original.comment }}”
            </div>
            <div v-if="row.original.account" class="mt-1 flex flex-wrap gap-1">
              <UBadge v-if="row.original.account.name" color="primary" variant="subtle" size="sm" :label="row.original.account.name" />
              <UBadge color="neutral" variant="outline" size="sm" :label="STATUS_LABEL[row.original.account.status] ?? row.original.account.status" />
              <UBadge v-if="purpose === 'coin'" color="neutral" variant="outline" size="sm" :label="row.original.bounceable ? 'bounceable' : 'non-bounceable'" />
            </div>
          </div>
        </template>
        <template #amount-cell="{ row }">
          <span class="font-mono text-xs whitespace-nowrap">{{ row.original.amount === null ? '—' : formatAmount(row.original.amount, decimals) }}</span>
        </template>
        <template #status-cell="{ row }">
          <div class="max-w-56 space-y-1 sm:max-w-80">
            <UBadge :color="rowStatus(row.original).color" variant="subtle" size="sm" :label="rowStatus(row.original).label" />
            <p v-if="row.original.error" class="text-xs text-error">
              {{ row.original.error }}
            </p>
            <p v-for="(n, i) in row.original.notes" :key="i" class="text-xs" :class="n.level === 'error' ? 'text-error' : n.level === 'warning' ? 'text-warning' : 'text-muted'">
              {{ n.text }}
            </p>
          </div>
        </template>
      </UTable>
      <p v-if="shown.length === 300" class="text-xs text-muted">
        Showing the first 300 rows. All {{ rows.length }} are checked and included.
      </p>
    </template>
  </div>
</template>
