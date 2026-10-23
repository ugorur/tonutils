<script setup lang="ts">
import type { CollectionItem, TcNftItemsPage, TonapiCollection } from '~/lib/nfts-read/core'
import { cachedCollectionItems, friendly, httpUrl, parseNftQuery, previewUrl, toCollectionItem, trustInfo } from '~/lib/nfts-read/core'
import type { Royalty } from '~/lib/nfts-read/royalty'
import { fetchRoyalty } from '~/lib/nfts-read/royalty'
import type { HolderStats } from './logic'
import { holderStats, itemCountLabel, percent } from './logic'

const EXAMPLES = [
  { label: 'TON Diamonds', value: 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir' },
  { label: 'Vintage Cigars (Telegram gift)', value: 'EQACcQpR2fmdeENWdE2YGQWHVxSTyA8Zq4_k7rk_IaxCRXNe' },
  { label: 'Anonymous Numbers', value: 'EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N' }
]
const BROWSE_PAGE = 24
/** Holder scan cap: toncenter serves 1000 items per request at ~1 request/s. */
const HOLDER_CAP = 20000

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const tc = useToncenter()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const query = computed(() => parseNftQuery(input.value))

const loading = ref(false)
const error = ref<unknown>(null)
const notFound = ref(false)
const col = ref<TonapiCollection | null>(null)
const royalty = ref<Royalty | null | undefined>()
let runId = 0

// item browser
const page = ref(0)
const pageItems = ref<CollectionItem[] | null>(null)
const pageLoading = ref(false)
const pageError = ref<unknown>(null)

// holders
const holders = ref<HolderStats | null>(null)
const holdersLoading = ref(false)
const holdersProgress = ref(0)
const holdersComplete = ref(true)
const holdersError = ref<unknown>(null)

async function lookup() {
  const q = query.value
  if (q.kind !== 'address') return
  const id = ++runId
  loading.value = true
  error.value = null
  notFound.value = false
  col.value = null
  royalty.value = undefined
  holders.value = null
  holdersError.value = null
  holdersLoading.value = false
  pageItems.value = null
  page.value = 0
  router.replace({ query: { ...route.query, address: input.value.trim() } })
  try {
    const c = await tonapi.get<TonapiCollection>(`nfts/collections/${q.raw}`).catch((e) => {
      if (e instanceof TonApiError && (e.status === 404 || e.status === 400)) return null
      throw e
    })
    if (id !== runId) return
    if (!c) {
      notFound.value = true
      return
    }
    col.value = c
    loadPage(0)
    fetchRoyalty(tc.baseUrl(), q.raw).then(r => id === runId && (royalty.value = r), () => id === runId && (royalty.value = null))
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

async function loadPage(p: number) {
  if (!col.value) return
  const id = runId
  page.value = p
  pageLoading.value = true
  pageError.value = null
  try {
    const res = await tc.v3<TcNftItemsPage>('nft/items', { collection_address: col.value.address, limit: BROWSE_PAGE, offset: p * BROWSE_PAGE })
    if (id === runId) pageItems.value = res.nft_items.map(it => toCollectionItem(it, res.metadata))
  }
  catch (e) {
    if (id === runId) pageError.value = e
  }
  finally {
    if (id === runId) pageLoading.value = false
  }
}

async function loadHolders() {
  if (!col.value) return
  const id = runId
  holdersLoading.value = true
  holdersError.value = null
  holdersProgress.value = 0
  try {
    const res = await cachedCollectionItems(network.value, col.value.address, HOLDER_CAP, tc.v3, {
      onProgress: n => id === runId && (holdersProgress.value = n),
      cancelled: () => id !== runId
    })
    if (id !== runId) return
    holders.value = holderStats(res.items)
    holdersComplete.value = res.complete
  }
  catch (e) {
    if (id === runId) holdersError.value = e
  }
  finally {
    if (id === runId) holdersLoading.value = false
  }
}

watch(network, () => (col.value || notFound.value) && lookup())
onMounted(() => query.value.kind === 'address' && lookup())

function tryExample(v: string) {
  input.value = v
  lookup()
}

const meta = computed(() => col.value?.metadata ?? {})
const trust = computed(() => trustInfo(col.value?.trust))
const colFriendly = computed(() => (col.value ? friendly(col.value.address, { testnet: isTestnet.value }) : ''))
const cover = computed(() => httpUrl(meta.value.cover_image))
const avatar = computed(() => previewUrl(col.value?.previews, '500x500', meta.value.image))
const links = computed(() => {
  const m = meta.value
  return [...new Set([m.external_link, m.external_url, ...(Array.isArray(m.social_links) ? m.social_links : [])].map(httpUrl).filter((u): u is string => !!u))]
})
const totalPages = computed(() => (col.value && col.value.next_item_index > 0 ? Math.ceil(col.value.next_item_index / BROWSE_PAGE) : null))
const hasNext = computed(() => (pageItems.value?.length ?? 0) === BROWSE_PAGE && (totalPages.value === null || page.value + 1 < totalPages.value))

const holderCsv = computed(() => (holders.value?.holders ?? []).map((h, i) => ({
  rank: i + 1,
  owner: friendly(h.owner, { bounceable: false, testnet: isTestnet.value }),
  owner_raw: h.owner,
  items: h.count,
  listed_for_sale: h.listed
})))

function itemLink(raw: string) {
  return `/tools/nft-viewer?address=${friendly(raw, { testnet: isTestnet.value })}`
}
const failed = reactive(new Set<string>())
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label="Collection address or link" :error="query.kind === 'invalid' ? query.error : undefined" hint="EQ…, 0:…, or a Getgems collection link">
        <div class="flex gap-2">
          <UInput
            v-model="input"
            placeholder="EQ… or https://getgems.io/collection/…"
            class="min-w-0 flex-1"
            size="lg"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" size="lg" icon="i-lucide-search" label="Explore" :loading="loading" :disabled="query.kind !== 'address'" />
        </div>
      </UFormField>
      <div v-if="!isTestnet" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Loading collection…" />
    <ErrorNotice :error="error" title="Could not load this collection" @retry="lookup" />
    <UAlert
      v-if="notFound"
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      title="Not an NFT collection"
      :description="`No collection at this address on ${network}. If it is a single NFT, open it in the NFT viewer.`"
      :actions="[{ label: 'Open as NFT', to: `/tools/nft-viewer?address=${encodeURIComponent(input.trim())}`, color: 'neutral', variant: 'outline' }]"
    />

    <template v-if="col">
      <UAlert v-if="col.trust === 'blacklist'" color="error" variant="subtle" icon="i-lucide-shield-alert" title="Spam or scam collection" :description="trust.hint" />

      <section class="overflow-hidden rounded-lg border border-default">
        <img v-if="cover" :src="cover" alt="" class="h-28 w-full object-cover sm:h-40" referrerpolicy="no-referrer">
        <div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
          <img v-if="avatar" :src="avatar" :alt="meta.name ?? 'Collection'" class="size-20 shrink-0 rounded-lg border border-default object-cover" referrerpolicy="no-referrer">
          <div class="min-w-0 flex-1 space-y-2">
            <h2 class="font-display text-xl font-semibold break-words text-highlighted">
              {{ meta.name || 'Unnamed collection' }}
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <UBadge :color="trust.color" variant="subtle" :label="trust.label" :title="trust.hint" />
              <UBadge v-for="a in col.approved_by" :key="a" color="neutral" variant="outline" :label="`Approved by ${a}`" />
            </div>
            <p v-if="meta.description" class="line-clamp-4 text-sm whitespace-pre-line text-muted">
              {{ meta.description }}
            </p>
            <div v-if="links.length" class="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <a v-for="l in links" :key="l" :href="l" target="_blank" rel="noopener nofollow" class="inline-flex items-center gap-1 text-muted hover:text-primary">{{ l.replace(/^https?:\/\//, '').replace(/\/$/, '') }}<UIcon name="i-lucide-arrow-up-right" class="size-3" /></a>
            </div>
          </div>
        </div>
      </section>

      <div class="grid gap-4 sm:grid-cols-2">
        <ResultField label="Collection address" :value="colFriendly">
          <div class="space-y-1">
            <span class="font-mono text-sm break-all text-highlighted">{{ colFriendly }}</span>
            <span class="block font-mono text-xs break-all text-dimmed">{{ col.address }}</span>
            <ExplorerLinks kind="collection" :value="colFriendly" />
          </div>
        </ResultField>
        <ResultField label="Items minted" :value="itemCountLabel(col.next_item_index)" :mono="false" :copy="false" hint="Next item index reported by the collection contract." />
        <ResultField label="Owner (admin)" value="" :copy="false" hint="Can mint new items and change collection settings. No owner means the collection is frozen.">
          <AddressLink v-if="col.owner" :address="col.owner.address" :bounceable="!col.owner.is_wallet" />
          <span v-else class="text-sm text-muted">None (no admin)</span>
        </ResultField>
        <ResultField label="Creator royalty" value="" :copy="false">
          <span v-if="royalty === undefined" class="text-sm text-muted">Loading…</span>
          <span v-else-if="royalty === null" class="text-sm text-muted">Not reported</span>
          <div v-else class="space-y-1">
            <div class="text-sm text-highlighted">
              {{ royalty.percent }}% of each sale
            </div>
            <AddressLink v-if="royalty.destination" :address="royalty.destination" :bounceable="false" />
          </div>
        </ResultField>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton :to="`/tools/nft-rarity?collection=${colFriendly}`" icon="i-lucide-gem" label="Rarity ranking" size="sm" color="neutral" variant="outline" />
      </div>

      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Items
          </h3>
          <div class="flex items-center gap-2">
            <UButton icon="i-lucide-chevron-left" size="xs" color="neutral" variant="outline" aria-label="Previous page" :disabled="page === 0 || pageLoading" @click="loadPage(page - 1)" />
            <span class="text-xs text-muted">Page {{ page + 1 }}<template v-if="totalPages"> of {{ totalPages.toLocaleString('en-US') }}</template></span>
            <UButton icon="i-lucide-chevron-right" size="xs" color="neutral" variant="outline" aria-label="Next page" :disabled="!hasNext || pageLoading" @click="loadPage(page + 1)" />
          </div>
        </div>
        <LoadingState v-if="pageLoading" label="Loading items…" />
        <ErrorNotice :error="pageError" title="Could not load items" @retry="loadPage(page)" />
        <p v-if="pageItems && !pageItems.length && !pageLoading" class="text-sm text-muted">
          No items indexed for this collection.
        </p>
        <div v-if="pageItems && !pageLoading" class="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          <NuxtLink v-for="it in pageItems" :key="it.raw" :to="itemLink(it.raw)" class="group overflow-hidden rounded-lg border border-default hover:border-primary">
            <div class="relative aspect-square bg-elevated">
              <img v-if="it.image && !failed.has(it.raw)" :src="it.image" :alt="it.name ?? `#${it.index}`" loading="lazy" referrerpolicy="no-referrer" class="size-full object-cover" @error="failed.add(it.raw)">
              <div v-else class="flex size-full items-center justify-center text-muted">
                <UIcon name="i-lucide-image-off" class="size-6" />
              </div>
              <UBadge v-if="it.onSale" label="For sale" color="success" variant="solid" size="sm" class="absolute top-1.5 left-1.5" />
            </div>
            <div class="truncate p-1.5 text-xs text-highlighted group-hover:text-primary">
              {{ it.name ?? `#${it.index}` }}
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="space-y-3 rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              Holders
            </h3>
            <p class="text-xs text-muted">
              Reads every item (up to {{ HOLDER_CAP.toLocaleString('en-US') }}, about 1 second per 1,000 items). Listed items count for their seller.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <CsvExportButton v-if="holders" :rows="holderCsv" :filename="`holders-${colFriendly}`" />
            <UButton v-if="!holders" icon="i-lucide-users" label="Load holders" size="sm" :loading="holdersLoading" @click="loadHolders" />
          </div>
        </div>
        <LoadingState v-if="holdersLoading" :label="`Reading items… ${holdersProgress.toLocaleString('en-US')} loaded`" />
        <ErrorNotice :error="holdersError" title="Could not load holders" @retry="loadHolders" />

        <template v-if="holders">
          <UAlert v-if="!holdersComplete" color="warning" variant="subtle" icon="i-lucide-info" :title="`Based on the first ${holders.items.toLocaleString('en-US')} items`" description="The collection is larger than this tool reads in one go, so the numbers below cover only part of it." />
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">
                Items read
              </div>
              <div class="text-lg font-semibold text-highlighted">
                {{ holders.items.toLocaleString('en-US') }}
              </div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">
                Unique holders
              </div>
              <div class="text-lg font-semibold text-highlighted">
                {{ holders.unique.toLocaleString('en-US') }}
              </div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">
                Listed for sale
              </div>
              <div class="text-lg font-semibold text-highlighted">
                {{ holders.listed.toLocaleString('en-US') }} <span class="text-xs font-normal text-muted">({{ percent(holders.items ? holders.listed / holders.items : 0) }})</span>
              </div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">
                Held by top 10
              </div>
              <div class="text-lg font-semibold text-highlighted">
                {{ percent(holders.top10Share) }}
              </div>
            </div>
          </div>

          <div>
            <h4 class="text-xs font-semibold text-muted uppercase">
              Distribution
            </h4>
            <div class="mt-2 space-y-1.5">
              <div v-for="b in holders.buckets" :key="b.label" class="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span class="text-muted">{{ b.label }}</span>
                <div class="h-2 overflow-hidden rounded-full bg-elevated">
                  <div class="h-full rounded-full bg-primary" :style="{ width: holders.unique ? `${(b.holders / holders.unique) * 100}%` : '0%' }" />
                </div>
                <span class="text-right text-highlighted">{{ b.holders.toLocaleString('en-US') }} holders · {{ b.items.toLocaleString('en-US') }} items</span>
              </div>
            </div>
          </div>

          <div>
            <h4 class="text-xs font-semibold text-muted uppercase">
              Top holders
            </h4>
            <ol class="mt-2 divide-y divide-default rounded-lg border border-default">
              <li v-for="(h, i) in holders.holders.slice(0, 20)" :key="h.owner" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span class="w-6 text-xs text-muted">{{ i + 1 }}</span>
                <AddressLink :address="h.owner" :bounceable="false" no-links class="min-w-0 flex-1" />
                <span class="text-sm text-highlighted">{{ h.count }} item{{ h.count === 1 ? '' : 's' }}</span>
                <span v-if="h.listed" class="text-xs text-muted">({{ h.listed }} listed)</span>
              </li>
            </ol>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
