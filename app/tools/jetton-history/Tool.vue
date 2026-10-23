<script setup lang="ts">
import JettonPicker from '~/lib/jettons-read/JettonPicker.vue'
import type { JettonBasics, TonapiJetton } from '~/lib/jettons-read/core'
import { formatTime, friendly, jettonBasics, toRaw, verificationInfo } from '~/lib/jettons-read/core'
import { explorerUrl } from '~/utils/ton/explorers'
import { USDT_MASTER } from '~/utils/ton/jetton'
import type { Direction, Filter, HistoryRow, TonapiJettonEvent } from './logic'
import { DIRECTION_LABELS, filterRows, historyRows, netChange } from './logic'

const PAGE = 50
// A real mainnet wallet with USD₮ transfers, a burn and failed attempts (see logic.test.ts).
const EXAMPLE_OWNER = 'UQDlbihKgJR3kgc4J3oN-hX9VBj9EQLs4H8e_J9n2tFLhDTi'

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()

const ownerInput = ref(typeof route.query.owner === 'string' ? route.query.owner : '')
const masterInput = ref(typeof route.query.jetton === 'string' ? route.query.jetton : isTestnet.value ? '' : USDT_MASTER)
const parse = (s: string) => {
  try {
    return s.trim() ? toRaw(s) : null
  }
  catch {
    return null
  }
}
const ownerRaw = computed(() => parse(ownerInput.value))
const masterRaw = computed(() => parse(masterInput.value))

const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const jetton = ref<JettonBasics | null>(null)
const balance = ref<bigint | null>(null)
const walletAddress = ref<string | null>(null)
const rows = ref<HistoryRow[]>([])
const nextLt = ref(0)
const filter = ref<Filter>('all')
const loaded = ref<{ owner: string, master: string } | null>(null)
let runId = 0

async function lookup() {
  const owner = ownerRaw.value
  const master = masterRaw.value
  if (!owner || !master) return
  const id = ++runId
  loading.value = true
  error.value = null
  jetton.value = null
  balance.value = null
  walletAddress.value = null
  rows.value = []
  nextLt.value = 0
  loaded.value = null
  try {
    try {
      const b = await tonapi.get<{ balance: string, wallet_address: { address: string }, jetton: { address: string, name: string, symbol: string, decimals: number, image?: string, verification: string } }>(`accounts/${owner}/jettons/${master}`)
      if (id !== runId) return
      jetton.value = { raw: b.jetton.address, name: b.jetton.name, symbol: b.jetton.symbol, decimals: b.jetton.decimals, image: b.jetton.image, verification: b.jetton.verification }
      balance.value = BigInt(b.balance)
      walletAddress.value = b.wallet_address.address
    }
    catch (e) {
      if ((e as { status?: number }).status !== 404) throw e
      // No jetton wallet for this owner: still show the token, history will be empty.
      try {
        const j = await tonapi.get<TonapiJetton>(`jettons/${master}`)
        if (id !== runId) return
        jetton.value = jettonBasics(j)
        balance.value = 0n
      }
      catch (e2) {
        if ((e2 as { status?: number }).status === 404) throw new Error('The token address is not a jetton master. Pick the token contract (for example USD₮), not a wallet.')
        throw e2
      }
    }
    loaded.value = { owner, master }
    await loadPage(id)
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

async function loadPage(id = runId) {
  const l = loaded.value
  if (!l) return
  const r = await tonapi.get<{ events: TonapiJettonEvent[], next_from: number }>(`accounts/${l.owner}/jettons/${l.master}/history`, { limit: PAGE, before_lt: nextLt.value || undefined })
  if (id !== runId) return
  rows.value = [...rows.value, ...historyRows(r.events, l.owner, l.master)]
  nextLt.value = r.events.length === PAGE ? r.next_from : 0
}

async function more() {
  loadingMore.value = true
  error.value = null
  try {
    await loadPage()
  }
  catch (e) {
    error.value = e
  }
  finally {
    loadingMore.value = false
  }
}

const shown = computed(() => filterRows(rows.value, filter.value))
const totals = computed(() => netChange(rows.value))
const counts = computed(() => ({
  all: rows.value.length,
  in: filterRows(rows.value, 'in').length,
  out: filterRows(rows.value, 'out').length,
  burn: filterRows(rows.value, 'burn').length,
  failed: filterRows(rows.value, 'failed').length
}))
const filterItems = computed(() => [
  { label: `All (${counts.value.all})`, value: 'all' },
  { label: `In (${counts.value.in})`, value: 'in' },
  { label: `Out (${counts.value.out})`, value: 'out' },
  ...(counts.value.burn ? [{ label: `Burns (${counts.value.burn})`, value: 'burn' }] : []),
  ...(counts.value.failed ? [{ label: `Failed (${counts.value.failed})`, value: 'failed' }] : [])
])

const INCOMING: Direction[] = ['in', 'mint', 'swap-in']
const DIR_ICON: Record<Direction, string> = {
  'in': 'i-lucide-arrow-down-left',
  'out': 'i-lucide-arrow-up-right',
  'self': 'i-lucide-arrow-right-left',
  'mint': 'i-lucide-sparkles',
  'burn': 'i-lucide-flame',
  'swap-in': 'i-lucide-arrow-right-left',
  'swap-out': 'i-lucide-arrow-right-left'
}

const columns = [
  { accessorKey: 'time', header: 'Time' },
  { accessorKey: 'direction', header: 'Type' },
  { accessorKey: 'amount', header: 'Amount' },
  { accessorKey: 'counterparty', header: 'From / to' },
  { accessorKey: 'comment', header: 'Comment' }
]

const csvRows = computed(() => rows.value.map(r => ({
  time_utc: new Date(r.time * 1000).toISOString(),
  type: DIRECTION_LABELS[r.direction],
  status: r.failed ? 'failed' : 'ok',
  amount: `${INCOMING.includes(r.direction) ? '' : r.direction === 'self' ? '' : '-'}${formatAmount(r.amount, jetton.value?.decimals ?? 9, { group: false })}`,
  symbol: jetton.value?.symbol ?? '',
  counterparty: r.counterparty ? friendly(r.counterparty.address, { bounceable: r.counterparty.is_wallet === false, testnet: isTestnet.value }) : '',
  counterparty_name: r.counterparty?.name ?? '',
  comment: r.encrypted ? '(encrypted)' : r.comment ?? '',
  tx_hash: r.txHash,
  event_id: r.eventId
})))

function tryExample() {
  ownerInput.value = EXAMPLE_OWNER
  masterInput.value = USDT_MASTER
  lookup()
}

onMounted(() => {
  if (ownerRaw.value && masterRaw.value) lookup()
})
watch(network, () => {
  if (loaded.value) lookup()
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="lookup">
      <AddressInput v-model="ownerInput" label="Wallet address" placeholder="UQ… / EQ… your wallet (not the jetton wallet)" />
      <JettonPicker v-model="masterInput" @pick="lookup" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" icon="i-lucide-history" label="Show history" :loading="loading" :disabled="!ownerRaw || !masterRaw" />
        <UButton v-if="!isTestnet" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Loading history…" />
    <ErrorNotice :error="error" title="Could not load the history" @retry="loaded ? more() : lookup()" />

    <template v-if="jetton && loaded && !loading">
      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar :src="jetton.image" :alt="jetton.symbol" size="lg" />
          <div class="min-w-0 flex-1 basis-48">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-display font-semibold text-highlighted">{{ jetton.name }}</span>
              <UBadge :color="verificationInfo(jetton.verification).color" variant="subtle" :label="verificationInfo(jetton.verification).label" />
            </div>
            <div class="text-xs text-muted">
              Current balance
            </div>
            <div class="text-xl font-semibold text-highlighted">
              <TokenAmount :nano="balance ?? 0n" :decimals="jetton.decimals" :symbol="jetton.symbol" />
            </div>
          </div>
        </div>
        <div v-if="walletAddress" class="mt-3 text-xs">
          <span class="text-muted">Jetton wallet </span>
          <AddressLink :address="walletAddress" />
        </div>
        <p v-else class="mt-3 text-sm text-muted">
          This wallet has never held {{ jetton.symbol }}: its jetton wallet does not exist yet.
        </p>
        <div v-if="rows.length" class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span class="text-muted">In the {{ rows.length }} loaded rows:</span>
          <span class="text-success">+<TokenAmount :nano="totals.received" :decimals="jetton.decimals" :symbol="jetton.symbol" :max-decimals="2" /></span>
          <span class="text-error">−<TokenAmount :nano="totals.sent" :decimals="jetton.decimals" :symbol="jetton.symbol" :max-decimals="2" /></span>
        </div>
      </section>

      <section>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UTabs v-model="filter" :content="false" :items="filterItems" size="xs" />
          <CsvExportButton :rows="csvRows" :filename="`${jetton.symbol}-history`" />
        </div>
        <UTable :data="shown" :columns="columns" class="mt-2 max-h-[40rem]" sticky :ui="{ td: 'py-2 align-top', th: 'py-2' }">
          <template #time-cell="{ row }">
            <a :href="explorerUrl('tonviewer', 'tx', row.original.txHash, network) ?? undefined" target="_blank" rel="noopener" class="text-xs whitespace-nowrap text-muted hover:text-primary">
              {{ formatTime(row.original.time) }}
            </a>
          </template>
          <template #direction-cell="{ row }">
            <div class="flex items-center gap-1.5 whitespace-nowrap">
              <UIcon :name="DIR_ICON[row.original.direction]" class="size-4" :class="row.original.failed ? 'text-muted' : INCOMING.includes(row.original.direction) ? 'text-success' : row.original.direction === 'burn' ? 'text-warning' : 'text-error'" />
              <span class="text-sm">{{ DIRECTION_LABELS[row.original.direction] }}</span>
              <UBadge v-if="row.original.failed" color="error" variant="subtle" size="sm" label="Failed" />
              <UBadge v-if="row.original.pending" color="warning" variant="subtle" size="sm" label="Pending" />
              <UBadge v-if="row.original.scam" color="error" variant="subtle" size="sm" label="Spam" />
            </div>
          </template>
          <template #amount-cell="{ row }">
            <span :class="row.original.failed ? 'text-muted line-through' : ''">
              {{ INCOMING.includes(row.original.direction) ? '+' : row.original.direction === 'self' ? '' : '−' }}<TokenAmount :nano="row.original.amount" :decimals="jetton.decimals" :symbol="''" :max-decimals="4" />
            </span>
          </template>
          <template #counterparty-cell="{ row }">
            <div v-if="row.original.counterparty" class="min-w-40">
              <div v-if="row.original.counterparty.name" class="text-xs text-highlighted">
                {{ row.original.counterparty.name }}
              </div>
              <UBadge v-if="row.original.counterparty.is_scam" color="error" variant="subtle" size="sm" label="Scam" />
              <AddressLink :address="row.original.counterparty.address" :bounceable="row.original.counterparty.is_wallet === false" no-links />
            </div>
            <span v-else class="text-muted">—</span>
          </template>
          <template #comment-cell="{ row }">
            <span v-if="row.original.encrypted" class="text-xs text-muted italic">Encrypted comment</span>
            <span v-else-if="row.original.comment" class="block max-w-64 text-sm break-words">{{ row.original.comment }}</span>
            <span v-else class="text-muted">—</span>
          </template>
          <template #empty>
            <span class="text-sm text-muted">{{ rows.length ? 'Nothing matches this filter.' : `No ${jetton.symbol} movements for this wallet.` }}</span>
          </template>
        </UTable>
        <UButton v-if="nextLt" class="mt-2" label="Load older" icon="i-lucide-chevron-down" variant="outline" color="neutral" :loading="loadingMore" @click="more" />
        <p class="mt-2 text-xs text-dimmed">
          From tonapi. "Failed" rows were attempted but bounced or were rejected (for example by a locked wallet); they did not move tokens. Scam tokens can fake transfers to look like they came from you: trust only the token master address.
        </p>
      </section>
    </template>
  </div>
</template>
