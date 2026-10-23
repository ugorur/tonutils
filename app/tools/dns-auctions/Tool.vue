<script setup lang="ts">
import { fetchItems, loadItemCode } from '~/lib/dns-read/api'
import { countdown, DNS_COLLECTION, itemAddress, utcDate } from '~/lib/dns-read/core'
import type { AuctionRow, Sort, TaAuction, Tld } from './logic'
import { applyFilters, bidUrl, csvRows, toRows, withChainState } from './logic'

const PAGE = 50

const { network, isTestnet } = useTonNetwork()
const toncenter = useToncenter()
const tonapi = useTonapi()

const route = useRoute()
const router = useRouter()
const tld = ref<Tld>(route.query.tld === 't.me' ? 't.me' : 'ton')
const tabs = computed(() => [
  { label: '.ton domains', value: 'ton', icon: 'i-lucide-globe' },
  ...(isTestnet.value ? [] : [{ label: 'Usernames', value: 't.me', icon: 'i-lucide-at-sign' }])
])

const loading = ref(false)
const error = ref<unknown>(null)
const rows = shallowRef<AuctionRow[]>([])
// undefined = checking, true = verified, false = could not verify (tonapi data shown)
const chainChecked = ref<boolean | undefined>()
const loadedAt = ref(0)
let runId = 0

async function load() {
  const id = ++runId
  const t = tld.value
  const net = network.value
  loading.value = true
  error.value = null
  rows.value = []
  chainChecked.value = undefined
  shown.value = PAGE
  try {
    const r = await tonapi.get<{ data: TaAuction[] }>('dns/auctions', { tld: t })
    if (id !== runId) return
    rows.value = toRows(r.data, t)
    loadedAt.value = now.value = Math.floor(Date.now() / 1000)
  }
  catch (e) {
    if (id === runId) error.value = e
    return
  }
  finally {
    if (id === runId) loading.value = false
  }
  if (t === 'ton') verifyOnChain(id, net)
}

// tonapi can lag behind the latest bid: re-read every .ton auction from its contract (~100 per toncenter call).
async function verifyOnChain(id: number, net: 'mainnet' | 'testnet') {
  try {
    const code = await loadItemCode(net, toncenter.v3)
    const byItem = new Map(rows.value.map(r => [itemAddress(r.name, DNS_COLLECTION[net], code).toRawString(), r.name]))
    const data = await fetchItems([...byItem.keys()], toncenter.v3)
    if (id !== runId) return
    rows.value = withChainState(rows.value, new Map([...data].map(([item, d]) => [byItem.get(item)!, d])))
    chainChecked.value = true
  }
  catch {
    if (id === runId) chainChecked.value = false
  }
}

const q = ref('')
const minLen = ref<number | null>(null)
const maxLen = ref<number | null>(null)
const sort = ref<Sort>('ending')
const SORTS = [
  { label: 'Ending soonest', value: 'ending' },
  { label: 'Ending last', value: 'newest' },
  { label: 'Highest bid', value: 'price-desc' },
  { label: 'Lowest bid', value: 'price-asc' },
  { label: 'Most bids', value: 'bids' },
  { label: 'Shortest name', value: 'shortest' }
]
const shown = ref(PAGE)

const now = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 30_000)
  if (isTestnet.value && tld.value === 't.me') tld.value = 'ton'
  else load()
})
onUnmounted(() => clearInterval(timer))
watch([tld, network], () => {
  if (isTestnet.value && tld.value === 't.me') {
    tld.value = 'ton'
    return
  }
  router.replace({ query: { ...route.query, tld: tld.value === 't.me' ? 't.me' : undefined } })
  load()
})
watch([q, minLen, maxLen, sort], () => (shown.value = PAGE))

const filtered = computed(() => applyFilters(rows.value, { q: q.value, minLen: minLen.value, maxLen: maxLen.value, sort: sort.value }, now.value))
const live = computed(() => rows.value.filter(r => r.endTime > now.value))
const endingHour = computed(() => live.value.filter(r => r.endTime - now.value < 3600).length)
const csv = computed(() => csvRows(filtered.value))
const lengthNote = computed(() => (tld.value === 'ton' ? '.ton names have 4 to 126 characters' : 'Usernames have 4 to 32 characters'))
</script>

<template>
  <div class="space-y-5">
    <UTabs v-model="tld" :items="tabs" :content="false" class="w-full" />

    <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
      <UFormField label="Search">
        <UInput v-model="q" placeholder="part of a name, e.g. wallet" icon="i-lucide-search" class="w-full" autocomplete="off" spellcheck="false" autocapitalize="off" />
      </UFormField>
      <div class="grid grid-cols-2 gap-3 sm:contents">
        <UFormField label="Min length">
          <UInputNumber v-model="minLen" :min="1" :max="126" placeholder="any" class="w-full sm:w-28" />
        </UFormField>
        <UFormField label="Max length">
          <UInputNumber v-model="maxLen" :min="1" :max="126" placeholder="any" class="w-full sm:w-28" />
        </UFormField>
      </div>
      <UFormField label="Sort">
        <USelect v-model="sort" :items="SORTS" class="w-full sm:w-44" />
      </UFormField>
    </div>
    <p class="-mt-2 text-xs text-muted">
      {{ lengthNote }}. Prices are in {{ COIN_SYMBOL }} (formerly Toncoin).
    </p>

    <ErrorNotice v-if="error" :error="error" @retry="load" />
    <LoadingState v-else-if="loading" :label="`Loading live ${tld === 'ton' ? '.ton' : 'username'} auctions from tonapi…`" />

    <template v-else-if="loadedAt">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span class="font-medium text-highlighted">{{ live.length }} live auctions<template v-if="filtered.length !== live.length">, {{ filtered.length }} match</template></span>
        <span class="text-muted">{{ endingHour }} ending within an hour</span>
        <span v-if="tld === 'ton'" class="text-xs text-muted">
          <template v-if="chainChecked === undefined">Checking bids on-chain…</template>
          <template v-else-if="chainChecked">
            <UIcon name="i-lucide-shield-check" class="-mb-0.5 size-3.5 text-success" /> Bids verified on-chain
          </template>
          <template v-else>Showing tonapi data (on-chain check unavailable)</template>
        </span>
        <div class="ml-auto flex gap-2">
          <UButton icon="i-lucide-refresh-cw" label="Refresh" size="xs" color="neutral" variant="outline" @click="load" />
          <CsvExportButton :rows="csv" :filename="`${tld === 'ton' ? 'ton' : 'telegram-username'}-auctions`" size="xs" />
        </div>
      </div>

      <UAlert
        v-if="!filtered.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-search-x"
        :title="live.length ? 'No auction matches these filters' : 'No live auctions right now'"
      />

      <ul v-else class="divide-y divide-default rounded-lg border border-default">
        <li v-for="r in filtered.slice(0, shown)" :key="r.domain" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2.5">
          <div class="min-w-0">
            <div class="font-mono text-sm break-all text-highlighted">
              {{ r.domain }}
            </div>
            <div class="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>{{ r.name.length }} chars · {{ r.bids }} bid{{ r.bids === 1 ? '' : 's' }}</span>
              <span v-if="r.tld === 'ton'" class="inline-flex items-center gap-1">· leader <AddressLink :address="r.owner" :bounceable="false" no-links /></span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="text-sm font-medium text-highlighted">
                <TokenAmount :nano="r.price" :max-decimals="2" />
              </div>
              <div class="text-xs" :class="r.endTime - now < 3600 ? 'text-error' : 'text-muted'" :title="utcDate(r.endTime)">
                ends in {{ countdown(r.endTime, now) }}
              </div>
            </div>
            <UButton v-if="r.tld === 'ton'" :to="`/tools/dns-bid?q=${r.domain}`" label="Bid" icon="i-lucide-gavel" size="xs" color="neutral" variant="outline" :aria-label="`Bid on ${r.domain}`" />
            <UButton v-else :to="bidUrl(r, isTestnet)" target="_blank" label="Bid" icon="i-lucide-external-link" size="xs" color="neutral" variant="outline" :aria-label="`Bid on ${r.domain} at Fragment`" />
            <UButton v-if="r.tld === 'ton'" :to="`/tools/dns-lookup?q=${r.domain}`" icon="i-lucide-search" size="xs" color="neutral" variant="ghost" :aria-label="`Details for ${r.domain}`" />
          </div>
        </li>
      </ul>
      <div v-if="filtered.length > shown" class="flex justify-center">
        <UButton :label="`Show more (${filtered.length - shown} left)`" color="neutral" variant="outline" @click="shown += PAGE" />
      </div>
      <p class="text-xs text-muted">
        <template v-if="tld === 'ton'">
          Each bid must be 5% above the last; a bid in the final hour moves the end to one hour after it. Bid here with TonConnect (or on dns.ton.org) from your own wallet.
        </template>
        <template v-else>
          Telegram usernames are auctioned on Fragment, Telegram's marketplace. Bid there with a wallet connected through TonConnect.
        </template>
        List from tonapi, loaded {{ utcDate(loadedAt) }}.
      </p>
    </template>
  </div>
</template>
