<script setup lang="ts">
import { fetchAccountStates, resolveName, useAccountClients } from '~/lib/accounts/api'
import type { AccountState } from '~/lib/accounts/core'
import { formatUtc, friendly, isDomainName, parseAccountList, STATUS_INFO, timeAgo, toRaw } from '~/lib/accounts/core'
import type { WatchItem } from '~/lib/accounts/watchlist'
import { addToWatchlist, loadWatchlist, saveWatchlist, WATCHLIST_MAX } from '~/lib/accounts/watchlist'
import type { Baseline, SortKey, WatchRow } from './logic'
import { baselineOf, buildRows, sortRows, totalBalance, withSnapshot } from './logic'

// Real mainnet accounts.
const EXAMPLE = [
  { raw: '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8', label: 'TON Foundation (old)' },
  { raw: '0:f99b14600ae44d2f12b178e8c6eabd78892ae82c5e45b6898f9deb7eb203f9c4', label: 'Binance deposit' },
  { raw: '0:4da6d2ad61da4f90e319095825556690d0fc303470f19186fa36f2320dc51381', label: 'W5 whale' }
]
const AUTO_MS = 60_000

const { network, isTestnet } = useTonNetwork()
const clients = useAccountClients(network)

const items = ref<WatchItem[]>([])
const baseline = shallowRef<Baseline>(new Map())
const states = shallowRef(new Map<string, AccountState>())
const loading = ref(false)
const error = ref<unknown>(null)
const extrasError = ref<unknown>(null)
const refreshedAt = ref(0)
const sort = ref<SortKey>('added')
const auto = ref(false)
let runId = 0

function load() {
  runId++ // drop any refresh still running for the other network
  loading.value = false
  items.value = loadWatchlist(network.value)
  baseline.value = baselineOf(items.value)
  states.value = new Map()
  refreshedAt.value = 0
  if (items.value.length) refresh()
}
function persist() {
  saveWatchlist(network.value, items.value)
}

// Latest call wins (runId), so a network switch or an add during a refresh is never dropped.
async function refresh() {
  if (!items.value.length) return
  const id = ++runId
  loading.value = true
  error.value = null
  try {
    const res = await fetchAccountStates(items.value.map(i => i.raw), clients)
    if (id !== runId) return
    states.value = res.states
    extrasError.value = res.extrasError ?? null
    refreshedAt.value = Date.now()
    items.value = withSnapshot(items.value, res.states)
    persist()
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

// ---- adding ----
const addInput = ref('')
const addLabel = ref('')
const adding = ref(false)
const addError = ref('')
const addNotice = ref('')

async function addMany(add: { raw: string, label: string }[]) {
  const { items: next, added } = addToWatchlist(items.value, add)
  const skipped = add.length - added
  items.value = next
  persist()
  addNotice.value = [
    added ? `Added ${added}.` : '',
    skipped ? `${skipped} already listed${next.length >= WATCHLIST_MAX ? ` or over the ${WATCHLIST_MAX} limit` : ''}.` : ''
  ].filter(Boolean).join(' ')
  if (added) await refresh()
}

async function addOne() {
  const v = addInput.value.trim()
  addError.value = addNotice.value = ''
  if (!v) return
  adding.value = true
  try {
    const raw = isDomainName(v) ? await resolveName(v, clients) : toRaw(v)
    await addMany([{ raw, label: addLabel.value.trim() || (isDomainName(v) ? v.toLowerCase() : '') }])
    addInput.value = addLabel.value = ''
  }
  catch (e) {
    addError.value = isDomainName(v) ? (e as Error).message : 'Not a valid TON address or .ton / .t.me name.'
  }
  finally {
    adding.value = false
  }
}

const showImport = ref(false)
const importText = ref('')
const importRows = computed(() => parseAccountList(importText.value))
async function importList() {
  addError.value = addNotice.value = ''
  adding.value = true
  const add: { raw: string, label: string }[] = []
  const failed: string[] = []
  for (const r of importRows.value) {
    if (r.error || r.duplicateOf) {
      if (r.error) failed.push(`line ${r.line}`)
      continue
    }
    try {
      add.push({ raw: r.raw ?? await resolveName(r.domain!, clients), label: r.label || (r.domain ?? '') })
    }
    catch {
      failed.push(`line ${r.line} (${r.domain})`)
    }
  }
  adding.value = false
  await addMany(add)
  if (failed.length) addError.value = `Skipped ${failed.join(', ')}: not a valid address or name.`
  else {
    importText.value = ''
    showImport.value = false
  }
}

function tryExample() {
  addMany(EXAMPLE)
}

// ---- editing ----
function setLabel(raw: string, label: string) {
  items.value = items.value.map(i => i.raw === raw ? { ...i, label: label.slice(0, 80) } : i)
  persist()
}
function remove(raw: string) {
  items.value = items.value.filter(i => i.raw !== raw)
  persist()
}
function clearAll() {
  if (!confirm(`Remove all ${items.value.length} addresses from this ${network.value} watchlist? This cannot be undone.`)) return
  items.value = []
  persist()
}

// ---- auto refresh (only while the tab is visible) ----
let timer: ReturnType<typeof setInterval> | undefined
watch(auto, (on) => {
  clearInterval(timer)
  if (on) timer = setInterval(() => document.visibilityState === 'visible' && !loading.value && refresh(), AUTO_MS)
})
onBeforeUnmount(() => clearInterval(timer))

watch(network, load)
onMounted(load)

const rows = computed(() => sortRows(buildRows(items.value, states.value, baseline.value), sort.value))
const total = computed(() => totalBalance(rows.value))
const exportRows = computed(() => items.value.map(i => ({ address: friendly(i.raw, { wallet: states.value.get(i.raw)?.isWallet ?? true, testnet: isTestnet.value }), label: i.label })))

function addrOf(r: WatchRow) {
  return friendly(r.item.raw, { wallet: r.state ? r.state.isWallet || r.state.status !== 'active' : true, testnet: isTestnet.value })
}
function deltaText(r: WatchRow) {
  if (!r.delta) return ''
  const abs = r.delta < 0n ? -r.delta : r.delta
  return `${r.delta > 0n ? '+' : '−'}${formatAmount(abs, COIN_DECIMALS)}`
}

const columns = [
  { accessorKey: 'label', header: 'Label' },
  { accessorKey: 'address', header: 'Address' },
  { accessorKey: 'balance', header: `${COIN_SYMBOL} balance` },
  { accessorKey: 'activity', header: 'Last activity' },
  { accessorKey: 'actions', header: '' }
]
const sortItems = [
  { label: 'Order added', value: 'added' },
  { label: 'Label A–Z', value: 'label' },
  { label: `Highest ${COIN_SYMBOL} first`, value: 'balance' },
  { label: 'Most recently active', value: 'activity' }
]
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-2">
      <form class="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end" @submit.prevent="addOne">
        <UFormField label="Address or name" :error="addError || undefined">
          <UInput
            v-model="addInput"
            placeholder="UQ…, EQ…, 0:… or name.ton"
            class="w-full"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>
        <UFormField label="Label (optional)">
          <UInput v-model="addLabel" placeholder="e.g. Savings" class="w-full" maxlength="80" />
        </UFormField>
        <UButton type="submit" label="Add" icon="i-lucide-plus" :loading="adding" :disabled="!addInput.trim()" class="justify-center" />
      </form>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton :label="showImport ? 'Hide list import' : 'Paste a list'" icon="i-lucide-list-plus" variant="link" size="sm" class="px-0" @click="showImport = !showImport" />
        <UButton v-if="!items.length" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
        <span v-if="addNotice" class="text-xs text-muted" role="status">{{ addNotice }}</span>
      </div>
      <div v-if="showImport" class="space-y-2">
        <UTextarea
          v-model="importText"
          :rows="4"
          autoresize
          :maxrows="10"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="One per line: address or name, then an optional label&#10;UQ…, Savings&#10;foundation.ton"
          aria-label="Addresses to import"
        />
        <UButton label="Add all" icon="i-lucide-plus" size="sm" :loading="adding" :disabled="!importRows.length" @click="importList" />
      </div>
      <p class="text-xs text-dimmed">
        Your list is stored only in this browser (separately for mainnet and testnet, up to {{ WATCHLIST_MAX }} addresses). Nothing is sent to TonUtils. Export it to keep a backup.
      </p>
    </section>

    <div v-if="!items.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
      Your {{ network }} watchlist is empty. Add an address above, or try the example.
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div class="text-xs text-muted">
            Total of {{ items.length }} address{{ items.length > 1 ? 'es' : '' }}
          </div>
          <div class="font-display text-2xl font-semibold text-highlighted">
            <TokenAmount :nano="total" :max-decimals="2" />
          </div>
          <div class="text-xs text-dimmed">
            {{ refreshedAt ? `Updated ${new Date(refreshedAt).toLocaleTimeString()}` : loading ? 'Loading…' : '' }}
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <USelect v-model="sort" :items="sortItems" size="sm" class="w-48" aria-label="Sort" />
          <USwitch v-model="auto" label="Auto-refresh (1 min)" size="sm" />
          <UButton label="Refresh" icon="i-lucide-refresh-cw" size="sm" variant="outline" :loading="loading" @click="refresh" />
        </div>
      </div>

      <ErrorNotice :error="error" title="Could not load balances" @retry="refresh" />
      <ErrorNotice v-if="extrasError" :error="extrasError" title="Last activity and scam flags are unavailable right now" @retry="refresh" />

      <!-- Phones: one card per address, so the balance is never scrolled out of view. -->
      <ul class="divide-y divide-default rounded-lg border border-default sm:hidden">
        <li v-for="r in rows" :key="r.item.raw" class="space-y-1 p-3">
          <div class="flex items-start gap-1">
            <UInput
              :model-value="r.item.label"
              placeholder="Add a label"
              size="sm"
              variant="ghost"
              class="min-w-0 flex-1"
              maxlength="80"
              :aria-label="`Label for ${r.item.raw}`"
              @change="setLabel(r.item.raw, ($event.target as HTMLInputElement).value)"
            />
            <UButton :to="`/tools/account-overview?q=${encodeURIComponent(r.item.raw)}`" icon="i-lucide-user-round-search" aria-label="Open in Account overview" variant="ghost" color="neutral" size="sm" />
            <UButton icon="i-lucide-x" aria-label="Remove from watchlist" variant="ghost" color="neutral" size="sm" @click="remove(r.item.raw)" />
          </div>
          <div class="flex items-baseline justify-between gap-2 px-2.5">
            <TokenAmount v-if="r.state" :nano="r.state.balance" :max-decimals="4" class="font-medium text-highlighted" />
            <span class="text-xs text-muted">{{ r.state ? timeAgo(r.state.lastActivity) : '' }}</span>
          </div>
          <div v-if="r.delta" class="px-2.5 font-mono text-xs" :class="r.delta < 0n ? 'text-error' : 'text-success'">
            {{ deltaText(r) }} <span class="font-sans text-dimmed">since {{ r.since ? timeAgo(Math.floor(r.since / 1000)) : 'last visit' }}</span>
          </div>
          <div class="px-2.5">
            <AddressLink :address="addrOf(r)" />
            <div class="mt-0.5 flex flex-wrap gap-1">
              <span v-if="r.state?.name" class="text-xs text-muted">{{ r.state.name }}</span>
              <UBadge v-if="r.state" :color="STATUS_INFO[r.state.status].color" variant="subtle" size="sm" :label="r.state.status === 'active' ? r.state.kind : STATUS_INFO[r.state.status].label" />
              <UBadge v-if="r.state?.isScam" color="error" variant="subtle" size="sm" label="Scam" />
              <UBadge v-if="r.state?.memoRequired" color="warning" variant="subtle" size="sm" label="Memo required" />
            </div>
          </div>
        </li>
      </ul>

      <UTable :data="rows" :columns="columns" class="hidden sm:block" :ui="{ td: 'py-2 align-top', th: 'py-2' }">
        <template #label-cell="{ row }">
          <UInput
            :model-value="row.original.item.label"
            placeholder="Add a label"
            size="sm"
            variant="ghost"
            class="min-w-32"
            maxlength="80"
            :aria-label="`Label for ${row.original.item.raw}`"
            @change="setLabel(row.original.item.raw, ($event.target as HTMLInputElement).value)"
          />
          <div v-if="row.original.state?.name" class="px-2.5 text-xs text-muted">
            {{ row.original.state.name }}
          </div>
        </template>
        <template #address-cell="{ row }">
          <AddressLink :address="addrOf(row.original)" />
          <div class="mt-0.5 flex flex-wrap gap-1">
            <UBadge v-if="row.original.state" :color="STATUS_INFO[row.original.state.status].color" variant="subtle" size="sm" :label="row.original.state.status === 'active' ? row.original.state.kind : STATUS_INFO[row.original.state.status].label" />
            <UBadge v-if="row.original.state?.isScam" color="error" variant="subtle" size="sm" label="Scam" />
            <UBadge v-if="row.original.state?.memoRequired" color="warning" variant="subtle" size="sm" label="Memo required" />
          </div>
        </template>
        <template #balance-cell="{ row }">
          <div class="whitespace-nowrap">
            <TokenAmount v-if="row.original.state" :nano="row.original.state.balance" :symbol="''" :max-decimals="4" />
            <span v-else class="text-muted">—</span>
          </div>
          <div v-if="row.original.delta" class="text-xs whitespace-nowrap" :class="row.original.delta < 0n ? 'text-error' : 'text-success'" :title="row.original.since ? `Since ${new Date(row.original.since).toLocaleString()}` : undefined">
            {{ deltaText(row.original) }}
            <span class="text-dimmed">since {{ row.original.since ? timeAgo(Math.floor(row.original.since / 1000)) : 'last visit' }}</span>
          </div>
        </template>
        <template #activity-cell="{ row }">
          <span class="text-sm whitespace-nowrap" :title="formatUtc(row.original.state?.lastActivity)">{{ row.original.state ? timeAgo(row.original.state.lastActivity) : '' }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton :to="`/tools/account-overview?q=${encodeURIComponent(row.original.item.raw)}`" icon="i-lucide-user-round-search" aria-label="Open in Account overview" variant="ghost" color="neutral" size="sm" />
            <UButton icon="i-lucide-x" aria-label="Remove from watchlist" variant="ghost" color="neutral" size="sm" @click="remove(row.original.item.raw)" />
          </div>
        </template>
      </UTable>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <CsvExportButton :rows="exportRows" :columns="['address', 'label']" :filename="`ton-watchlist-${network}`" label="Export list" />
          <UButton to="/tools/portfolio" label="Value in Portfolio" icon="i-lucide-chart-pie" variant="link" size="sm" />
        </div>
        <UButton label="Clear all" icon="i-lucide-trash" color="error" variant="link" size="sm" class="px-0" @click="clearAll" />
      </div>
      <p class="text-xs text-dimmed">
        Changes are measured against the balances seen on your previous visit. Balances from toncenter, last activity and names from tonapi. {{ COIN_RENAME_NOTE }}
      </p>
    </template>
  </div>
</template>
