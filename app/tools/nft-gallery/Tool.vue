<script setup lang="ts">
import type { TonapiNftItem } from '~/lib/nfts-read/core'
import { friendly, nameError, NFT_KIND_LABELS, parseNftQuery, trustInfo } from '~/lib/nfts-read/core'
import type { GalleryItem, KindFilter } from './logic'
import { countKinds, csvRows, filterItems, groupByCollection, PAGE_SIZE, toGalleryItem } from './logic'

const EXAMPLES = [
  { label: 'Collector wallet', value: 'UQAaHJP8UTXncDT3EwAESD0mIgMoQvJlPKT9kPjTrf-fyiZZ' },
  { label: 'Telegram gift holder', value: 'UQAVgTYjmtsV3VnfkMZB-e_TEs_rhmTyGPTD5fzp2V5sB1R_' },
  { label: 'foundation.ton', value: 'foundation.ton' }
]
/** tonapi keyless pages are 100 items; 10 pages ≈ 10–20 s. */
const MAX_ITEMS = 1000

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()

const input = ref(typeof route.query.address === 'string' ? route.query.address : '')
const query = computed(() => parseNftQuery(input.value, { allowNames: true }))

const loading = ref(false)
const error = ref<unknown>(null)
const items = ref<GalleryItem[] | null>(null)
const capped = ref(false)
const owner = ref('')
const kind = ref<KindFilter>('all')
const showSpam = ref(false)
const search = ref('')
let runId = 0

let account = ''
let nextOffset = 0
const done = ref(true)

async function lookup() {
  const q = query.value
  if (q.kind !== 'address' && q.kind !== 'domain') return
  runId++
  items.value = null
  capped.value = false
  kind.value = 'all'
  router.replace({ query: { ...route.query, address: input.value.trim() } })
  account = q.kind === 'domain' ? q.name : q.raw
  owner.value = q.kind === 'domain' ? q.name : friendly(q.raw, { bounceable: false, testnet: isTestnet.value })
  nextOffset = 0
  done.value = false
  await loadRest()
}

/** Loads the remaining pages; after a rate-limit error "Try again" resumes where it stopped. */
async function loadRest() {
  const id = runId
  loading.value = true
  error.value = null
  try {
    while (!done.value && nextOffset < MAX_ITEMS) {
      const page = await tonapi.get<{ nft_items: TonapiNftItem[] }>(`accounts/${account}/nfts`, { limit: PAGE_SIZE, offset: nextOffset, indirect_ownership: true })
      if (id !== runId) return
      items.value = [...(items.value ?? []), ...page.nft_items.map(toGalleryItem)]
      nextOffset += PAGE_SIZE
      if (page.nft_items.length < PAGE_SIZE) done.value = true
    }
    if (!done.value) {
      capped.value = true
      done.value = true
    }
  }
  catch (e) {
    if (id === runId) error.value = query.value.kind === 'domain' && !items.value ? nameError(e, account, network.value) : e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

watch(network, () => items.value && lookup())
onMounted(() => (query.value.kind === 'address' || query.value.kind === 'domain') && lookup())

function tryExample(v: string) {
  input.value = v
  lookup()
}

const spamCount = computed(() => items.value?.filter(i => i.spam).length ?? 0)
const kinds = computed(() => (items.value ? countKinds(items.value) : null))
const kindTabs = computed(() => {
  const k = kinds.value
  if (!k) return []
  const total = Object.values(k).reduce((a, b) => a + b, 0)
  return [
    { label: `All (${total})`, value: 'all' as KindFilter },
    ...(Object.keys(NFT_KIND_LABELS) as (keyof typeof NFT_KIND_LABELS)[])
      .filter(id => k[id] > 0)
      .map(id => ({ label: `${NFT_KIND_LABELS[id]} (${k[id]})`, value: id as KindFilter }))
  ]
})
const shown = computed(() => (items.value ? filterItems(items.value, { kind: kind.value, showSpam: showSpam.value, search: search.value }) : []))
const groups = computed(() => groupByCollection(shown.value))
const csv = computed(() => csvRows(shown.value, isTestnet.value))

function itemLink(raw: string) {
  return `/tools/nft-viewer?address=${friendly(raw, { testnet: isTestnet.value })}`
}
function collectionLink(raw: string) {
  return `/tools/nft-collection-info?address=${friendly(raw, { testnet: isTestnet.value })}`
}
const failed = reactive(new Set<string>())
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label="Wallet address or name" :error="query.kind === 'invalid' ? query.error : undefined" hint="UQ…, EQ…, 0:…, name.ton or name.t.me">
        <div class="flex gap-2">
          <UInput
            v-model="input"
            placeholder="UQ… or name.ton"
            class="min-w-0 flex-1"
            size="lg"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" size="lg" icon="i-lucide-layout-grid" label="Show NFTs" :loading="loading" :disabled="query.kind !== 'address' && query.kind !== 'domain'" />
        </div>
      </UFormField>
      <div v-if="!isTestnet" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="items ? `Loading NFTs… ${items.length} so far` : 'Loading NFTs…'" />
    <ErrorNotice :error="error" :title="items?.length ? `Stopped after ${items.length} NFTs` : 'Could not load NFTs'" @retry="items?.length ? loadRest() : lookup()" />

    <template v-if="items && (!loading || items.length)">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-mono text-sm break-all text-highlighted">
            {{ owner }}
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ items.length - spamCount }} NFT{{ items.length - spamCount === 1 ? '' : 's' }}{{ done ? '' : ' loaded so far' }}, including ones listed for sale.
            <template v-if="spamCount">
              {{ spamCount }} spam NFT{{ spamCount === 1 ? '' : 's' }} hidden.
            </template>
            <template v-if="capped">
              Showing the first {{ MAX_ITEMS }}.
            </template>
          </p>
        </div>
        <CsvExportButton :rows="csv" :filename="`nfts-${owner}`" />
      </div>

      <UAlert v-if="!items.length" color="neutral" variant="subtle" icon="i-lucide-inbox" title="No NFTs" :description="`This wallet holds no NFTs on ${network}.`" />

      <template v-else>
        <div class="space-y-3">
          <div v-if="kindTabs.length > 2" class="flex flex-wrap gap-1.5">
            <UButton
              v-for="t in kindTabs"
              :key="t.value"
              :label="t.label"
              size="xs"
              :color="kind === t.value ? 'primary' : 'neutral'"
              :variant="kind === t.value ? 'solid' : 'outline'"
              @click="kind = t.value"
            />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Filter by name or collection" size="sm" class="min-w-0 flex-1 sm:max-w-xs" />
            <USwitch v-if="spamCount" v-model="showSpam" :label="`Show spam (${spamCount})`" size="sm" />
          </div>
          <UAlert
            v-if="showSpam"
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-alert"
            title="Spam NFTs are scams"
            description="Unsolicited NFTs that promise vouchers, rewards or unlock codes lead to wallet drainers. Never visit their links or sign anything they ask for."
          />
        </div>

        <p v-if="!shown.length" class="text-sm text-muted">
          Nothing matches these filters.
        </p>

        <section v-for="g in groups" :key="g.key" class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <NuxtLink v-if="g.collection" :to="collectionLink(g.collection)" class="font-display text-sm font-semibold text-highlighted hover:text-primary">
              {{ g.name || 'Unnamed collection' }}
            </NuxtLink>
            <h3 v-else class="font-display text-sm font-semibold text-highlighted">
              {{ g.name }}
            </h3>
            <UBadge :label="String(g.items.length)" color="neutral" variant="subtle" size="sm" />
            <UBadge v-if="g.trust !== 'none'" :label="trustInfo(g.trust).label" :color="trustInfo(g.trust).color" variant="subtle" size="sm" />
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            <NuxtLink v-for="it in g.items" :key="it.raw" :to="itemLink(it.raw)" class="group overflow-hidden rounded-lg border border-default hover:border-primary">
              <div class="relative aspect-square bg-elevated">
                <img v-if="it.image && !failed.has(it.raw)" :src="it.image" :alt="it.name" loading="lazy" referrerpolicy="no-referrer" class="size-full object-cover" :class="it.spam && 'opacity-40 blur-sm'" @error="failed.add(it.raw)">
                <div v-else class="flex size-full items-center justify-center text-muted">
                  <UIcon name="i-lucide-image-off" class="size-8" />
                </div>
                <UBadge v-if="it.sale" label="For sale" color="success" variant="solid" size="sm" class="absolute top-2 left-2" />
                <UBadge v-if="it.spam" label="Spam" color="error" variant="solid" size="sm" class="absolute top-2 right-2" />
              </div>
              <div class="space-y-0.5 p-2">
                <div class="truncate text-sm text-highlighted group-hover:text-primary" :title="it.name">
                  {{ it.name }}
                </div>
                <div v-if="it.sale" class="truncate text-xs text-muted">
                  <TokenAmount :nano="it.sale.units" :decimals="it.sale.decimals" :symbol="it.sale.symbol" :max-decimals="2" /> on {{ it.sale.market }}
                </div>
              </div>
            </NuxtLink>
          </div>
        </section>
      </template>
      <p class="text-xs text-dimmed">
        Spam detection and verification come from tonapi. Anyone can mint an NFT into your wallet; it does not mean you bought it.
      </p>
    </template>
  </div>
</template>
