<script setup lang="ts">
import { Address } from '@ton/core'
import { formatJettonAmount, jettonDecimals, parseJettonAmount, USDT_MASTER } from '~/utils/ton/jetton'
import {
  airdropList, applyFilters, csvRows, jettonHolders, nftOwners, PAGE, share, summarize,
  type AddressBook, type HolderRow, type JettonWalletItem, type NftItem
} from './logic'

const route = useRoute()
const router = useRouter()
const { isTestnet, network } = useTonNetwork()
const toncenter = useToncenter()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = shallowRef<Address | null>(null)
const limit = ref(10_000)
const LIMITS = [1_000, 10_000, 50_000, 100_000, 250_000].map(n => ({ label: `Top ${n.toLocaleString('en-US')}`, value: n }))

interface Target {
  kind: 'jetton' | 'nft'
  raw: string
  name: string
  symbol: string
  decimals: number
  /** Total supply (jetton base units) or item count (NFT). */
  total: bigint
}
const target = ref<Target | null>(null)
const all = shallowRef<HolderRow[]>([])
const takenAt = ref<Date | null>(null)
const truncated = ref(false)
const loaded = ref(0)
const loading = ref(false)
const progress = ref({ label: '', value: 0, max: 1 })
const error = ref<unknown>(null)
let runId = 0

interface Meta { token_info?: { name?: string, symbol?: string, extra?: Record<string, string> }[] }

async function resolve(raw: string): Promise<Target> {
  const j = await toncenter.v3<{ jetton_masters: { total_supply: string, jetton_content: Record<string, string> | null }[], metadata?: Record<string, Meta> }>('jetton/masters', { address: raw })
  const m = j.jetton_masters[0]
  if (m) {
    const info = Object.values(j.metadata ?? {})[0]?.token_info?.[0]
    const content = m.jetton_content ?? {}
    return { kind: 'jetton', raw, name: info?.name || content.name || 'Jetton', symbol: info?.symbol || content.symbol || '', decimals: jettonDecimals(info?.extra?.decimals ? { decimals: info.extra.decimals } : content), total: BigInt(m.total_supply) }
  }
  const c = await toncenter.v3<{ nft_collections: { next_item_index: string }[], metadata?: Record<string, Meta> }>('nft/collections', { collection_address: raw, limit: 1 })
  const col = c.nft_collections[0]
  if (!col) throw new Error(`This address is neither a jetton master nor an NFT collection on ${network.value}.`)
  const info = Object.values(c.metadata ?? {})[0]?.token_info?.[0]
  const next = BigInt(col.next_item_index)
  return { kind: 'nft', raw, name: info?.name || 'NFT collection', symbol: 'items', decimals: 0, total: next > 0n ? next : 0n }
}

/** A long snapshot should survive a busy API: the shared client retries 3 times, we add a few slower rounds. */
async function patient<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    }
    catch (e) {
      if (!(e instanceof TonApiError && (e.isRateLimit || e.status >= 500 || e.status === 0)) || i >= 4) throw e
      await new Promise(r => setTimeout(r, 3000 * (i + 1)))
    }
  }
}

async function run() {
  const a = parsed.value
  if (!a) return
  const id = ++runId
  loading.value = true
  error.value = null
  all.value = []
  target.value = null
  truncated.value = false
  router.replace({ query: { ...route.query, q: input.value.trim() } })
  try {
    progress.value = { label: 'Reading the contract…', value: 0, max: 1 }
    const t = await patient(() => resolve(a.toRawString()))
    if (id !== runId) return
    target.value = t
    const book: AddressBook = {}
    const wallets: JettonWalletItem[] = []
    const items: NftItem[] = []
    const pages = Math.ceil(limit.value / PAGE)
    for (let p = 0; p < pages; p++) {
      progress.value = { label: `Loading ${t.kind === 'jetton' ? 'holders' : 'items'} ${(p * PAGE).toLocaleString('en-US')}–${((p + 1) * PAGE).toLocaleString('en-US')}…`, value: p, max: pages }
      let got: number
      if (t.kind === 'jetton') {
        const r = await patient(() => toncenter.v3<{ jetton_wallets: JettonWalletItem[], address_book: AddressBook }>('jetton/wallets', { jetton_address: t.raw, exclude_zero_balance: true, sort: 'desc', limit: PAGE, offset: p * PAGE }))
        wallets.push(...r.jetton_wallets)
        Object.assign(book, r.address_book)
        got = r.jetton_wallets.length
      }
      else {
        const r = await patient(() => toncenter.v3<{ nft_items: NftItem[], address_book: AddressBook }>('nft/items', { collection_address: t.raw, include_on_sale: true, limit: PAGE, offset: p * PAGE }))
        items.push(...r.nft_items)
        Object.assign(book, r.address_book)
        got = r.nft_items.length
      }
      if (id !== runId) return
      if (got < PAGE) break
      if (p === pages - 1) truncated.value = true
    }
    all.value = t.kind === 'jetton' ? jettonHolders(wallets, book) : nftOwners(items, book)
    // Collections without a counter (next_item_index -1, e.g. Telegram Numbers): the size is known only after a full read.
    if (t.kind === 'nft' && t.total === 0n && !truncated.value) target.value = { ...t, total: BigInt(items.length) }
    loaded.value = t.kind === 'jetton' ? wallets.length : items.length
    takenAt.value = new Date()
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}
function stop() {
  runId++
  loading.value = false
}
function tryExample() {
  input.value = isTestnet.value ? '' : USDT_MASTER
  limit.value = 1_000
  nextTick(run)
}

// ---------------------------------------------------------------- filters
const minText = ref('')
const excludeContracts = ref(true)
const excludeText = ref('')
const minUnits = computed(() => {
  if (!minText.value.trim() || !target.value) return 0n
  try {
    return parseJettonAmount(minText.value, target.value.decimals)
  }
  catch {
    return null
  }
})
const excludeSet = computed(() => new Set(excludeText.value.split(/[\s,;]+/).flatMap((s) => {
  try {
    return s ? [Address.parse(s).toRawString()] : []
  }
  catch {
    return []
  }
})))
const rows = computed(() => applyFilters(all.value, { min: minUnits.value ?? 0n, excludeContracts: excludeContracts.value, exclude: excludeSet.value }))
const summary = computed(() => summarize(rows.value))
const SHOW = 300
const friendly = (raw: string) => Address.parse(raw).toString({ bounceable: false, testOnly: isTestnet.value })
const amountText = (r: HolderRow) => target.value?.kind === 'nft' ? `${r.amount} item${r.amount === 1n ? '' : 's'}` : formatJettonAmount(r.amount, target.value?.decimals ?? 9, { maxDecimals: 4 })
const exportRows = computed(() => target.value ? csvRows(rows.value, { decimals: target.value.decimals, total: target.value.total, nft: target.value.kind === 'nft', friendly }) : [])
const airdrop = computed(() => target.value ? airdropList(rows.value, target.value.kind === 'nft' ? null : target.value.decimals, friendly) : '')
const fileBase = computed(() => `${target.value?.symbol || 'holders'}-snapshot-${takenAt.value?.toISOString().slice(0, 10) ?? ''}`.replace(/[^\w.-]+/g, '_'))

const KIND = {
  wallet: { label: 'Wallet', color: 'neutral' },
  contract: { label: 'Contract', color: 'warning' },
  unknown: { label: 'Not deployed / unknown', color: 'neutral' }
} as const

const columns = computed(() => [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'amount', header: target.value?.kind === 'nft' ? 'Items' : 'Balance' },
  { accessorKey: 'share', header: '% of total' },
  { accessorKey: 'kind', header: 'Type' }
])

watch(network, () => {
  all.value = []
  target.value = null
})
onMounted(() => {
  if (input.value) nextTick(run)
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <AddressInput v-model="input" label="Jetton master or NFT collection address" placeholder="EQ…" @parsed="parsed = $event" @keydown.enter="run" />
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="How many" help="Largest holders first. Each 1,000 is one request to the public API: a few seconds, longer when it is busy.">
          <USelect v-model="limit" :items="LIMITS" class="w-44" />
        </UFormField>
        <UButton label="Take snapshot" icon="i-lucide-camera" :loading="loading" :disabled="!parsed" @click="run" />
        <UButton v-if="loading" label="Stop" icon="i-lucide-square" variant="outline" color="neutral" @click="stop" />
        <UButton v-if="!isTestnet" label="Try an example (USD₮, top 1,000)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
    </div>

    <div v-if="loading" class="space-y-2" role="status" aria-live="polite">
      <div class="text-sm text-muted">
        {{ progress.label }}
      </div>
      <UProgress :model-value="progress.value" :max="progress.max" size="sm" />
    </div>
    <ErrorNotice :error="error" title="Snapshot failed" @retry="run" />

    <template v-if="target && all.length">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            {{ target.kind === 'nft' ? 'Collection' : 'Token' }}
          </div>
          <div class="mt-0.5 truncate font-semibold text-highlighted">
            {{ target.name }} <span v-if="target.kind === 'jetton'" class="text-xs font-normal text-muted">{{ target.symbol }}</span>
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            {{ target.kind === 'nft' ? 'Owners' : 'Holders' }} (after filters)
          </div>
          <div class="mt-0.5 font-semibold text-highlighted">
            {{ summary.holders.toLocaleString('en-US') }} <span class="text-xs font-normal text-muted">of {{ all.length.toLocaleString('en-US') }}{{ truncated ? '+' : '' }}</span>
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            Held by them
          </div>
          <div class="mt-0.5 font-semibold text-highlighted">
            {{ share(summary.sum, target.total) ? `${share(summary.sum, target.total)}%` : '—' }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            Snapshot taken
          </div>
          <div class="mt-0.5 text-sm font-semibold text-highlighted">
            {{ takenAt?.toLocaleString('en-GB') }}
          </div>
        </div>
      </div>
      <UAlert
        v-if="truncated"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="target.kind === 'nft' ? `Only the first ${loaded.toLocaleString('en-US')} items were read` : `Showing the largest ${loaded.toLocaleString('en-US')} holders only`"
        :description="`There are more. Pick a larger number above and take the snapshot again.${target.total ? '' : ' Shares of the total are hidden until the whole collection is read.'}`"
      />

      <div class="grid gap-3 rounded-lg border border-default p-4 sm:grid-cols-2">
        <UFormField :label="target.kind === 'nft' ? 'Minimum items' : `Minimum balance (${target.symbol || 'tokens'})`" :error="minUnits === null ? 'Not a valid amount' : undefined">
          <UInput v-model="minText" inputmode="decimal" placeholder="0" class="w-full" />
        </UFormField>
        <UFormField label="Leave out these addresses" help="Team, treasury or your own wallets. Comma or newline separated.">
          <UTextarea v-model="excludeText" :rows="1" autoresize :maxrows="5" class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="UQ…, EQ…" />
        </UFormField>
        <UCheckbox v-model="excludeContracts" class="sm:col-span-2" label="Leave out contracts (DEX pools, vaults, staking, sale contracts)" :description="`${all.filter(r => r.kind === 'contract').length} owners are contracts. Holders whose wallet was never deployed stay in.`" />
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <CopyButton :value="airdrop" label="Copy as address,amount list" />
        <CsvExportButton :rows="exportRows" :filename="fileBase" />
      </div>

      <UTable :data="rows.slice(0, SHOW)" :columns="columns" sticky class="max-h-[36rem]" :ui="{ td: 'py-2 align-top', th: 'py-2' }">
        <template #owner-cell="{ row }">
          <div class="min-w-44 max-w-80">
            <AddressLink :address="friendly(row.original.owner)" no-links />
            <div v-if="row.original.domain" class="text-xs text-muted">
              {{ row.original.domain }}
            </div>
          </div>
        </template>
        <template #amount-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ amountText(row.original) }}</span>
          <div v-if="row.original.onSale" class="text-xs text-dimmed">
            {{ row.original.onSale }} listed for sale
          </div>
        </template>
        <template #share-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ share(row.original.amount, target!.total) ? `${share(row.original.amount, target!.total)}%` : '—' }}</span>
        </template>
        <template #kind-cell="{ row }">
          <UBadge :color="KIND[row.original.kind].color" variant="subtle" size="sm" :label="KIND[row.original.kind].label" />
          <div v-if="row.original.kind === 'contract'" class="mt-0.5 max-w-40 truncate text-xs text-dimmed" :title="row.original.interfaces.join(', ')">
            {{ row.original.interfaces.join(', ') }}
          </div>
        </template>
        <template #empty>
          <span class="text-sm text-muted">No holder passes these filters.</span>
        </template>
      </UTable>
      <p v-if="rows.length > SHOW" class="text-xs text-dimmed">
        Showing the first {{ SHOW }} of {{ rows.length.toLocaleString('en-US') }}. The CSV and the copied list contain all of them.
      </p>
      <p class="text-xs text-dimmed">
        Balances as indexed by toncenter at the time above. NFTs listed on a marketplace count for the seller. Burned holdings (the zero address) are left out. % is of the {{ target.kind === 'nft' ? 'collection size' : 'total supply' }}.
      </p>
    </template>
    <p v-else-if="target && !loading && !error" class="text-sm text-muted">
      No holders found.
    </p>
  </div>
</template>
