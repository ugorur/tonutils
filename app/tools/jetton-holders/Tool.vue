<script setup lang="ts">
import JettonPicker from '~/lib/jettons-read/JettonPicker.vue'
import type { JettonBasics, TonapiJetton } from '~/lib/jettons-read/core'
import { friendly, jettonBasics, toRaw, verificationInfo } from '~/lib/jettons-read/core'
import { KNOWN_JETTONS } from '~/utils/ton/jetton'
import type { HolderRow, TonapiHolder } from './logic'
import { buildHolders, concentration, formatShare, KIND_LABELS } from './logic'

const PAGE = 100
const MAX_ROWS = 1000
const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const masterRaw = computed(() => {
  try {
    return input.value.trim() ? toRaw(input.value) : null
  }
  catch {
    return null
  }
})

const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const jetton = ref<{ basics: JettonBasics, supply: bigint, holdersCount: number } | null>(null)
const rows = ref<HolderRow[]>([])
const total = ref(0)
let runId = 0

async function lookup() {
  const raw = masterRaw.value
  if (!raw) return
  const id = ++runId
  loading.value = true
  error.value = null
  jetton.value = null
  rows.value = []
  try {
    let j: TonapiJetton
    try {
      j = await tonapi.get<TonapiJetton>(`jettons/${raw}`)
    }
    catch (e) {
      if ((e as { status?: number }).status === 404) throw new Error('This address is not a jetton master. Paste the token contract address (not a wallet).')
      throw e
    }
    if (id !== runId) return
    jetton.value = { basics: jettonBasics(j), supply: BigInt(j.total_supply), holdersCount: j.holders_count }
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
  if (!jetton.value) return
  const r = await tonapi.get<{ addresses: TonapiHolder[], total: number }>(`jettons/${jetton.value.basics.raw}/holders`, { limit: PAGE, offset: rows.value.length })
  if (id !== runId) return
  total.value = r.total
  rows.value = [...rows.value, ...buildHolders(r.addresses, jetton.value.supply, jetton.value.basics.raw, rows.value.length)]
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

const conc = computed(() => (rows.value.length ? concentration(rows.value) : null))
const empty = computed(() => !!jetton.value && !loading.value && !rows.value.length && !error.value)
const canLoadMore = computed(() => rows.value.length < Math.min(total.value, MAX_ROWS) && rows.value.length % PAGE === 0)
const LEVEL = {
  high: { label: 'High concentration', color: 'error', text: 'The 10 biggest holders own half of the supply or more. A few addresses can move the price a lot.' },
  moderate: { label: 'Moderate concentration', color: 'warning', text: 'The 10 biggest holders own between a quarter and a half of the supply.' },
  low: { label: 'Well distributed', color: 'success', text: 'The 10 biggest holders own less than a quarter of the supply.' }
} as const
const BAR_COLORS = ['bg-primary-600', 'bg-primary-500', 'bg-primary-400', 'bg-primary-300', 'bg-primary-200']

const columns = [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'owner', header: 'Holder' },
  // Share before balance: on narrow screens the table scrolls sideways and share is what people look for.
  { accessorKey: 'share', header: 'Share' },
  { accessorKey: 'balance', header: 'Balance' }
]

const csvRows = computed(() => rows.value.map(r => ({
  rank: r.rank,
  owner: friendly(r.owner, { bounceable: false, testnet: isTestnet.value }),
  owner_raw: r.owner,
  label: r.name ?? '',
  type: KIND_LABELS[r.kind] || 'Wallet',
  jetton_wallet: friendly(r.wallet, { testnet: isTestnet.value }),
  balance: formatAmount(r.balance, jetton.value?.basics.decimals ?? 9, { group: false }),
  share_percent: r.share
})))

function tryExample(master: string) {
  input.value = master
  lookup()
}

onMounted(() => {
  if (masterRaw.value) lookup()
})
watch(network, () => {
  if (jetton.value) lookup()
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <JettonPicker v-model="input" @pick="lookup" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" icon="i-lucide-users" label="Show holders" :loading="loading" :disabled="!masterRaw" />
        <UButton v-if="!isTestnet" label="Try an example (NOT)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample(KNOWN_JETTONS[1]!.master)" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Loading holders…" />
    <ErrorNotice :error="error" title="Could not load holders" @retry="rows.length ? more() : lookup()" />

    <p v-if="empty" class="text-sm text-muted">
      Nobody holds {{ jetton?.basics.symbol }} yet.
    </p>

    <template v-if="jetton && conc">
      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar :src="jetton.basics.image" :alt="jetton.basics.symbol" size="lg" />
          <div class="min-w-0 flex-1 basis-48">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-display font-semibold break-words text-highlighted">{{ jetton.basics.name }}</span>
              <UBadge color="neutral" variant="outline" :label="jetton.basics.symbol" />
              <UBadge :color="verificationInfo(jetton.basics.verification).color" variant="subtle" :label="verificationInfo(jetton.basics.verification).label" />
            </div>
            <div class="text-xs text-muted">
              {{ total.toLocaleString('en-US') }} holders · supply {{ formatAmount(jetton.supply, jetton.basics.decimals, { maxDecimals: 2 }) }} {{ jetton.basics.symbol }}
            </div>
          </div>
          <UBadge :color="LEVEL[conc.level].color" variant="subtle" size="lg" :label="LEVEL[conc.level].label" />
        </div>

        <div class="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-elevated" role="img" :aria-label="`Top 10 holders own ${formatShare(conc.top10)} of the supply`">
          <div v-for="(r, i) in rows.slice(0, 10)" :key="r.wallet" :class="BAR_COLORS[i % BAR_COLORS.length]" class="h-full border-r border-default" :style="{ width: `${r.share}%` }" :title="`#${r.rank}: ${formatShare(r.share)}`" />
        </div>
        <p class="mt-2 text-sm text-muted">
          {{ LEVEL[conc.level].text }}
        </p>

        <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt class="text-xs text-muted">
              Top 1
            </dt>
            <dd class="text-lg font-semibold text-highlighted">
              {{ formatShare(conc.top1) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Top 10
            </dt>
            <dd class="text-lg font-semibold text-highlighted">
              {{ formatShare(conc.top10) }}
            </dd>
          </div>
          <div v-if="rows.length >= 50">
            <dt class="text-xs text-muted">
              Top 50
            </dt>
            <dd class="text-lg font-semibold text-highlighted">
              {{ formatShare(conc.top50) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Top 10 personal wallets
            </dt>
            <dd class="text-lg font-semibold text-highlighted">
              {{ formatShare(conc.top10Wallets) }}
            </dd>
          </div>
        </dl>
        <p class="mt-2 text-xs text-dimmed">
          Exchanges and contracts (DEX pools, vaults, bridges) hold tokens for many users, so "personal wallets" leaves them out. Labels come from tonapi's public account names and can be incomplete.
        </p>
      </section>

      <section>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Top {{ rows.length }} holders
          </h3>
          <CsvExportButton :rows="csvRows" :filename="`${jetton.basics.symbol}-holders`" />
        </div>
        <UTable :data="rows" :columns="columns" class="mt-2 max-h-[36rem]" sticky :ui="{ td: 'py-2 px-2 sm:px-4', th: 'py-2 px-2 sm:px-4' }">
          <template #rank-cell="{ row }">
            <span class="text-muted tabular-nums">{{ row.original.rank }}</span>
          </template>
          <template #owner-cell="{ row }">
            <div>
              <div v-if="row.original.name || KIND_LABELS[row.original.kind]" class="flex flex-wrap items-center gap-1.5 text-sm">
                <span v-if="row.original.name" class="text-highlighted">{{ row.original.name }}</span>
                <UBadge v-if="KIND_LABELS[row.original.kind]" :color="row.original.kind === 'scam' ? 'error' : row.original.kind === 'burn' ? 'warning' : 'neutral'" variant="subtle" size="sm" :label="KIND_LABELS[row.original.kind]" />
              </div>
              <AddressLink :address="row.original.owner" :bounceable="false" no-links />
            </div>
          </template>
          <template #balance-cell="{ row }">
            <TokenAmount :nano="row.original.balance" :decimals="jetton.basics.decimals" :symbol="''" :max-decimals="2" />
          </template>
          <template #share-cell="{ row }">
            <span class="whitespace-nowrap tabular-nums">{{ formatShare(row.original.share) }}</span>
          </template>
          <template #empty>
            <span class="text-sm text-muted">Nobody holds this token yet.</span>
          </template>
        </UTable>
        <UButton v-if="canLoadMore" class="mt-2" :label="`Load next ${PAGE}`" icon="i-lucide-chevron-down" variant="outline" color="neutral" :loading="loadingMore" @click="more" />
        <p v-else-if="rows.length >= MAX_ROWS" class="mt-2 text-xs text-dimmed">
          Showing the top {{ MAX_ROWS }}.
        </p>
      </section>
    </template>
  </div>
</template>
