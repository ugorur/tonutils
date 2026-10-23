<script setup lang="ts">
import { fetchAccountStates, useAccountClients } from '~/lib/accounts/api'
import { friendly, timeAgo } from '~/lib/accounts/core'
import { compactNumber, fetchGramMarket, KNOWN_ACCOUNTS_SOURCE, loadKnownAccounts } from '~/lib/defi-analytics/shared'
import type { RichRow, TopAccount } from './logic'
import { buildRows, MAX_ROWS, PAGE_SIZE } from './logic'

const { network, isTestnet } = useTonNetwork()
const clients = useAccountClients(network)

const rows = ref<RichRow[]>([])
const supply = ref<number | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const warning = ref('')
const hideSystem = ref(false)
let runId = 0

async function loadPage(reset: boolean) {
  const id = reset ? ++runId : runId
  if (reset) {
    rows.value = []
    warning.value = ''
  }
  loading.value = true
  error.value = null
  const offset = rows.value.length
  try {
    // CoinGecko and GitHub run on their own queues, in parallel with toncenter/tonapi.
    const supplyJob = isTestnet.value || supply.value !== null
      ? Promise.resolve(isTestnet.value ? null : supply.value)
      : fetchGramMarket().then(m => m.totalSupply, () => {
          warning.value = 'Total supply is unavailable from CoinGecko right now, so shares of supply are not shown.'
          return null
        })
    const knownJob = isTestnet.value ? Promise.resolve(new Map<string, string>()) : loadKnownAccounts()
    const top = await clients.v3<TopAccount[]>('topAccountsByBalance', { limit: PAGE_SIZE, offset })
    if (id !== runId) return
    const { states, extrasError } = await fetchAccountStates(top.map(t => t.account.toLowerCase()), clients)
    if (extrasError) warning.value = 'Names and last activity from tonapi could not be loaded for some accounts.'
    const [total, known] = await Promise.all([supplyJob, knownJob])
    if (id !== runId) return
    supply.value = total
    const before = rows.value.reduce((s, r) => s + r.balance, 0n)
    rows.value = [...rows.value, ...buildRows(top, offset, states, known, total, before)]
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

onMounted(() => loadPage(true))
watch(network, () => {
  supply.value = null
  loadPage(true)
})

const shown = computed(() => (hideSystem.value ? rows.value.filter(r => !r.raw.startsWith('-1:')) : rows.value))
const pct = (f: number | null, d = 2) => (f === null ? '—' : `${(f * 100).toFixed(d)}%`)
const top = (n: number) => rows.value.length >= n ? rows.value[n - 1]!.cumulative : null

const wide = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }
const columns = [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'raw', header: 'Account' },
  { accessorKey: 'kind', header: 'Type', meta: wide },
  { accessorKey: 'lastActivity', header: 'Last active', meta: wide },
  { accessorKey: 'balance', header: 'Balance' }
]

const csvRows = computed(() => rows.value.map(r => ({
  rank: r.rank,
  address: friendly(r.raw, { wallet: r.isWallet, testnet: isTestnet.value }),
  raw: r.raw,
  name: r.name ?? '',
  type: r.kind,
  balance: formatAmount(r.balance, COIN_DECIMALS, { group: false }),
  share_of_supply: r.share ?? '',
  last_active_utc: r.lastActivity ? new Date(r.lastActivity * 1000).toISOString() : ''
})))
</script>

<template>
  <div class="space-y-6">
    <section v-if="supply && rows.length >= 10" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="n in [1, 10, 50, 100]" :key="n" class="rounded-lg border border-default p-3">
        <div class="text-xs text-muted">
          Top {{ n === 1 ? 'account' : n }} hold{{ n === 1 ? 's' : '' }}
        </div>
        <div class="font-display text-xl font-semibold text-highlighted">
          {{ top(n) !== null ? pct(top(n), 1) : '…' }}
        </div>
        <div class="text-xs text-dimmed">
          {{ top(n) !== null ? 'of total supply' : `load ${n} rows to see` }}
        </div>
      </div>
    </section>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <USwitch v-model="hideSystem" label="Hide masterchain accounts (elector, validators)" size="sm" />
      <CsvExportButton v-if="rows.length" :rows="csvRows" :filename="`ton-rich-list-${network}`" />
    </div>

    <UAlert v-if="warning" color="warning" variant="subtle" icon="i-lucide-info" :title="warning" />
    <ErrorNotice :error="error" title="Could not load the rich list" @retry="loadPage(!rows.length)" />
    <LoadingState v-if="loading && !rows.length" label="Loading the top accounts…" />

    <UTable v-if="rows.length" :data="shown" :columns="columns" :ui="{ td: 'py-2 px-2 sm:px-4', th: 'py-2 px-2 sm:px-4' }">
      <template #rank-cell="{ row }">
        <span class="font-mono text-xs text-muted">{{ row.original.rank }}</span>
      </template>
      <template #raw-cell="{ row }">
        <div class="max-w-[11rem] min-w-0 sm:max-w-none">
          <div v-if="row.original.name" class="truncate text-sm text-highlighted">
            {{ row.original.name }}
            <UBadge v-if="row.original.isScam" label="scam" color="error" variant="subtle" size="sm" />
          </div>
          <AddressLink :address="friendly(row.original.raw, { wallet: row.original.isWallet, testnet: isTestnet })" />
          <div class="text-xs text-muted sm:hidden">
            {{ row.original.kind }}
          </div>
        </div>
      </template>
      <template #lastActivity-cell="{ row }">
        <span class="text-sm whitespace-nowrap text-muted">{{ timeAgo(row.original.lastActivity) }}</span>
      </template>
      <template #balance-cell="{ row }">
        <div class="text-right">
          <TokenAmount :nano="row.original.balance" :max-decimals="0" class="hidden sm:inline" />
          <span class="font-mono text-sm sm:hidden" :title="formatAmount(row.original.balance)">{{ compactNumber(Number(row.original.balance / 1000000000n)) }}</span>
          <div class="text-xs text-dimmed">
            {{ pct(row.original.share) }}
          </div>
        </div>
      </template>
    </UTable>

    <div v-if="rows.length" class="flex flex-wrap items-center gap-3">
      <UButton
        v-if="rows.length < MAX_ROWS"
        :label="`Load the next ${PAGE_SIZE}`"
        icon="i-lucide-chevrons-down"
        variant="soft"
        :loading="loading"
        @click="loadPage(false)"
      />
      <span class="text-xs text-muted">Showing {{ shown.length }} of the top {{ rows.length }} accounts on {{ network }}.</span>
    </div>

    <p class="text-xs text-dimmed">
      Ranking and balances from the toncenter indexer, account types and names from tonapi, labels from <a :href="KNOWN_ACCOUNTS_SOURCE" target="_blank" rel="noopener" class="underline hover:text-primary">tonkeeper/ton-assets</a>, total supply from CoinGecko. A label is a public claim, not proof of ownership. "Suspended" accounts are inactive early-miner wallets frozen for 48 months by a 2023 validator vote; their coins cannot move until then. Exchange hot and cold wallets hold coins for many customers. {{ COIN_RENAME_NOTE }}
    </p>
  </div>
</template>
