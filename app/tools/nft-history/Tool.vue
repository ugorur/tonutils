<script setup lang="ts">
import type { TcAddressBook } from '~/lib/nfts-read/core'
import { formatUtc, friendly, nameError, parseNftQuery, tcKey } from '~/lib/nfts-read/core'
import { explorerUrl } from '~/utils/ton/explorers'
import type { HistoryRow, TcActionsPage } from './logic'
import { ACTIONS_PATH, csvRows, fetchTrust, HISTORY_PAGE, toRow } from './logic'

const EXAMPLES = [
  { label: 'One NFT (Diamond #12)', value: 'EQDstIwX6ZQ9-57WA9dNBtQyDPXic-_AKQOFwTot37Dl6JrH' },
  { label: 'A collector wallet', value: 'UQAaHJP8UTXncDT3EwAESD0mIgMoQvJlPKT9kPjTrf-fyiZZ' }
]

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()
const tonapi = useTonapi()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const query = computed(() => parseNftQuery(input.value, { allowNames: true }))

const loading = ref(false)
const loadingMore = ref(false)
const error = ref<unknown>(null)
const account = ref<string | null>(null)
const mode = ref<'item' | 'wallet' | 'collection'>('wallet')
const rows = ref<HistoryRow[]>([])
const book = ref<TcAddressBook>({})
const hasMore = ref(false)
let offset = 0
let runId = 0

async function fetchPage(raw: string, id: number) {
  const page = await tc.v3<TcActionsPage>(ACTIONS_PATH, { account: raw, limit: HISTORY_PAGE, offset, sort: 'desc' })
  if (id !== runId) return
  if (offset === 0) {
    const ifaces = page.address_book[tcKey(raw)]?.interfaces ?? []
    mode.value = ifaces.some(i => i.startsWith('nft_item') || i === 'sbt') ? 'item' : ifaces.includes('nft_collection') ? 'collection' : 'wallet'
  }
  book.value = { ...book.value, ...page.address_book }
  const me = mode.value === 'item' ? undefined : raw
  const fresh = page.actions.map(a => toRow(a, page.metadata, me))
  if (me) {
    // Spam flags are a nice-to-have: if tonapi fails, show everything.
    const trust = await fetchTrust(tonapi.baseUrl(), fresh.flatMap(r => (r.item ? [r.item] : []))).catch(() => new Map<string, string>())
    if (id !== runId) return
    for (const r of fresh) r.spam = !!r.item && trust.get(r.item) === 'blacklist'
  }
  // New events shift offset paging by one or more rows; drop the repeats (v-for keys must stay unique).
  const seen = new Set(rows.value.map(r => r.id))
  rows.value = [...rows.value, ...fresh.filter(r => !seen.has(r.id))]
  offset += page.actions.length
  hasMore.value = page.actions.length === HISTORY_PAGE
}

async function lookup() {
  const q = query.value
  if (q.kind !== 'address' && q.kind !== 'domain') return
  const id = ++runId
  loading.value = true
  error.value = null
  rows.value = []
  book.value = {}
  account.value = null
  offset = 0
  hasMore.value = false
  router.replace({ query: { ...route.query, address: input.value.trim() } })
  try {
    const raw = q.kind === 'domain'
      ? (await tonapi.get<{ address: string }>(`accounts/${q.name}`).catch((e) => { throw nameError(e, q.name, network.value) })).address.toLowerCase()
      : q.raw
    if (id !== runId) return
    account.value = raw
    await fetchPage(raw, id)
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

async function loadMore() {
  if (!account.value) return
  loadingMore.value = true
  error.value = null
  try {
    await fetchPage(account.value, runId)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loadingMore.value = false
  }
}

watch(network, () => account.value && lookup())
onMounted(() => (query.value.kind === 'address' || query.value.kind === 'domain') && lookup())

function tryExample(v: string) {
  input.value = v
  lookup()
}

/** Domain or short friendly address from toncenter's address book. */
function nameOf(raw?: string, full = false): string {
  if (!raw) return ''
  const e = book.value[tcKey(raw)]
  if (e?.domain) return e.domain
  const f = e?.user_friendly ?? friendly(raw, { testnet: isTestnet.value })
  return full ? f : `${f.slice(0, 4)}…${f.slice(-4)}`
}
function linkOf(raw: string): string {
  return explorerUrl('tonviewer', 'address', book.value[tcKey(raw)]?.user_friendly ?? raw, network.value) ?? '#'
}
function itemLink(raw: string) {
  return `/tools/nft-viewer?address=${friendly(raw, { testnet: isTestnet.value })}`
}
function txLink(tx: string) {
  return explorerUrl('tonviewer', 'tx', tx, network.value) ?? '#'
}

const isMe = (raw?: string) => !!raw && raw === account.value
const showSpam = ref(false)
const failed = reactive(new Set<string>())
const spamCount = computed(() => rows.value.filter(r => r.spam).length)
const visible = computed(() => (showSpam.value ? rows.value : rows.value.filter(r => !r.spam)))
const csv = computed(() => csvRows(visible.value, r => nameOf(r, true)))
const sales = computed(() => rows.value.filter(r => r.type === 'nft_purchase' && r.price !== undefined))
const accountName = computed(() => (account.value ? nameOf(account.value, true) : ''))

const selfName = computed(() => (mode.value === 'collection' ? 'this contract' : 'this wallet'))
const MODE_LABEL = { item: 'NFT provenance', wallet: 'Wallet NFT activity', collection: 'Collection contract activity' }
const BADGE: Record<string, 'success' | 'primary' | 'warning' | 'neutral' | 'error'> = {
  nft_purchase: 'success', dns_purchase: 'success', nft_mint: 'primary', nft_put_on_sale: 'warning', teleitem_start_auction: 'warning', nft_put_on_auction: 'warning', auction_bid: 'primary'
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label="NFT or wallet address" :error="query.kind === 'invalid' ? query.error : undefined" help="NFT address or link for its provenance; wallet address or .ton name for its NFT activity">
        <div class="flex gap-2">
          <UInput
            v-model="input"
            placeholder="EQ…, UQ…, name.ton or a Getgems link"
            class="min-w-0 flex-1"
            size="lg"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" size="lg" icon="i-lucide-history" label="Show" :loading="loading" :disabled="query.kind !== 'address' && query.kind !== 'domain'" />
        </div>
      </UFormField>
      <div v-if="!isTestnet" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Loading NFT activity…" />
    <ErrorNotice :error="error" title="Could not load the history" @retry="rows.length ? loadMore() : lookup()" />

    <template v-if="account && !loading">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :label="MODE_LABEL[mode]" color="primary" variant="subtle" />
            <span class="font-mono text-sm break-all text-highlighted">{{ accountName }}</span>
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ rows.length }} event{{ rows.length === 1 ? '' : 's' }}{{ hasMore ? ' loaded so far' : '' }}, newest first.
            <template v-if="sales.length">
              {{ sales.length }} sale{{ sales.length === 1 ? '' : 's' }}.
            </template>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <USwitch v-if="spamCount" v-model="showSpam" size="sm" :label="`Show spam (${spamCount})`" />
          <UButton v-if="mode === 'item'" :to="itemLink(account)" label="View NFT" icon="i-lucide-image" size="sm" color="neutral" variant="outline" />
          <CsvExportButton :rows="csv" :filename="`nft-history-${accountName}`" />
        </div>
      </div>

      <UAlert
        v-if="mode === 'collection'"
        color="info"
        variant="subtle"
        icon="i-lucide-library"
        title="This is a collection contract"
        description="Below are NFTs sent to or from the collection contract itself. To browse its items and holders, open the collection explorer."
        :actions="[{ label: 'Open collection explorer', to: `/tools/nft-collection-info?address=${accountName}`, color: 'neutral', variant: 'outline' }]"
      />

      <UAlert
        v-if="!rows.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-inbox"
        title="No NFT activity found"
        :description="`toncenter has no NFT mints, transfers or sales for this address on ${network}.`"
      />

      <p v-if="spamCount && !showSpam" class="text-xs text-muted">
        {{ spamCount }} event{{ spamCount === 1 ? '' : 's' }} with NFTs that tonapi flags as spam or scam are hidden. Anyone can send NFTs to any wallet; never open links written on them.
      </p>

      <ol v-if="visible.length" class="divide-y divide-default rounded-lg border border-default">
        <li v-for="r in visible" :key="r.id" class="flex gap-3 px-3 py-3">
          <NuxtLink v-if="mode !== 'item' && r.item" :to="itemLink(r.item)" class="shrink-0">
            <img v-if="r.itemImage && !failed.has(r.id)" :src="r.itemImage" :alt="r.itemName ?? 'NFT'" class="size-12 rounded-md border border-default object-cover" loading="lazy" referrerpolicy="no-referrer" @error="failed.add(r.id)">
            <div v-else class="flex size-12 items-center justify-center rounded-md border border-default text-muted">
              <UIcon name="i-lucide-image" class="size-5" />
            </div>
          </NuxtLink>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <UBadge :label="r.label" :color="BADGE[r.type] ?? 'neutral'" variant="subtle" />
              <UBadge v-if="!r.success" label="Failed" color="error" variant="outline" />
              <UBadge v-if="r.spam" label="Spam" color="error" variant="subtle" />
              <NuxtLink v-if="mode !== 'item' && r.item" :to="itemLink(r.item)" class="min-w-0 truncate text-sm text-highlighted hover:text-primary">
                {{ r.itemName ?? nameOf(r.item) }}
              </NuxtLink>
              <span v-if="r.price !== undefined" class="ml-auto text-sm font-semibold text-highlighted">
                <span class="mr-1 text-xs font-normal text-muted">{{ r.priceLabel }}:</span>
                <TokenAmount :nano="r.price" :max-decimals="4" />
              </span>
            </div>
            <div v-if="r.from || r.to" class="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <template v-if="r.from">
                <span>from</span>
                <a :href="linkOf(r.from)" target="_blank" rel="noopener" class="font-mono hover:text-primary" :class="isMe(r.from) && 'font-semibold text-highlighted'">{{ isMe(r.from) && mode !== 'item' ? selfName : nameOf(r.from) }}</a>
              </template>
              <template v-if="r.to">
                <span>to</span>
                <a :href="linkOf(r.to)" target="_blank" rel="noopener" class="font-mono hover:text-primary" :class="isMe(r.to) && 'font-semibold text-highlighted'">{{ isMe(r.to) && mode !== 'item' ? selfName : nameOf(r.to) }}</a>
              </template>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 text-xs text-dimmed">
              <span>{{ formatUtc(r.time) }}</span>
              <a :href="txLink(r.tx)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 hover:text-primary">Transaction<UIcon name="i-lucide-arrow-up-right" class="size-3" /></a>
            </div>
          </div>
        </li>
      </ol>

      <UButton v-if="hasMore" label="Load older events" icon="i-lucide-chevrons-down" color="neutral" variant="outline" block :loading="loadingMore" @click="loadMore" />
      <p class="text-xs text-dimmed">
        Events are classified by the toncenter indexer. Prices are in {{ COIN_SYMBOL }} (formerly {{ COIN_FORMER }}) as paid by the buyer, before marketplace fees and royalties.
      </p>
    </template>
  </div>
</template>
