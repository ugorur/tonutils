<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { TcNftItemsPage, TonapiNftItem } from '~/lib/nfts-read/core'
import { friendly, NFT_KIND_LABELS, parseNftQuery, tcKey, trustInfo } from '~/lib/nfts-read/core'
import type { NftView, Royalty } from './logic'
import { fetchRoyalty, nftView, royaltyOn } from './logic'

const EXAMPLES = [
  { label: 'Diamond for sale', value: 'EQDstIwX6ZQ9-57WA9dNBtQyDPXic-_AKQOFwTot37Dl6JrH' },
  { label: 'Telegram gift', value: 'EQBFVkKsUPc08IcXIA3gdvyczyOrghyrYy18EBf0xUvr_g4z' },
  { label: 'Soulbound token', value: 'EQCtrNX55WDBHcIR8Yv5GeYbKK9-Z5fHPH_Gv5NRRBPvXjyR' }
]

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
const view = ref<NftView | null>(null)
const rawItem = ref<TonapiNftItem | null>(null)
// Exact index as a string (tonapi sends a JSON number, which rounds hash-sized indexes).
const tcIndex = ref<string | undefined>()
// undefined = unknown (toncenter unreachable)
const interfaces = ref<string[] | undefined>()
// undefined = loading, null = none / failed
const royalty = ref<Royalty | null | undefined>()
const showVideo = ref(false)
const imgFailed = ref(false)
let runId = 0

async function lookup() {
  const q = query.value
  if (q.kind !== 'address') return
  const id = ++runId
  loading.value = true
  error.value = null
  notFound.value = false
  view.value = null
  rawItem.value = null
  royalty.value = undefined
  showVideo.value = false
  imgFailed.value = false
  router.replace({ query: { ...route.query, address: input.value.trim() } })
  try {
    const [item, tcPage] = await Promise.all([
      tonapi.get<TonapiNftItem>(`nfts/${q.raw}`).catch((e) => {
        if (e instanceof TonApiError && (e.status === 404 || e.status === 400)) return null
        throw e
      }),
      tc.v3<TcNftItemsPage>('nft/items', { address: q.raw, limit: 1 }).catch(() => null)
    ])
    if (id !== runId) return
    if (!item) {
      notFound.value = true
      return
    }
    rawItem.value = item
    tcIndex.value = tcPage?.nft_items[0]?.index
    interfaces.value = tcPage ? (tcPage.address_book[tcKey(q.raw)]?.interfaces ?? []) : undefined
    view.value = nftView(item, interfaces.value ?? [])
    loadRoyalty(item.collection?.address, id)
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

async function loadRoyalty(collection: string | undefined, id: number) {
  if (!collection) {
    royalty.value = null
    return
  }
  try {
    const r = await fetchRoyalty(tc.baseUrl(), collection)
    if (id === runId) royalty.value = r
  }
  catch {
    if (id === runId) royalty.value = null
  }
}

watch(network, () => (view.value || notFound.value) && lookup())
onMounted(() => query.value.kind === 'address' && lookup())

function tryExample(v: string) {
  input.value = v
  lookup()
}

const v = computed(() => view.value)
const trust = computed(() => trustInfo(v.value?.trust))
const itemFriendly = computed(() => (v.value ? friendly(v.value.raw, { testnet: isTestnet.value }) : ''))
const collectionFriendly = computed(() => (v.value?.collection ? friendly(v.value.collection.raw, { testnet: isTestnet.value }) : ''))

const details = computed<KeyValueItem[]>(() => {
  if (!v.value || !rawItem.value) return []
  const rows: KeyValueItem[] = [{ label: 'NFT address', value: itemFriendly.value }, { label: 'Raw address', value: v.value.raw }]
  rows.push({ label: 'Index in collection', value: tcIndex.value ?? String(rawItem.value.index), copy: false, hint: (tcIndex.value?.length ?? 0) > 15 ? 'Hash-based index (Telegram collections and domains use these).' : undefined })
  if (v.value.dns) rows.push({ label: 'Domain', value: v.value.dns, mono: false })
  return rows
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label="NFT address or link" :error="query.kind === 'invalid' ? query.error : undefined" hint="EQ…, 0:…, or a Getgems / Tonviewer / Tonscan link">
        <div class="flex gap-2">
          <UInput
            v-model="input"
            placeholder="EQ… or https://getgems.io/…"
            class="min-w-0 flex-1"
            size="lg"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" size="lg" icon="i-lucide-search" label="View" :loading="loading" :disabled="query.kind !== 'address'" />
        </div>
      </UFormField>
      <div v-if="!isTestnet" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Loading NFT…" />
    <ErrorNotice :error="error" title="Could not load this NFT" @retry="lookup" />
    <UAlert
      v-if="notFound"
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      title="No NFT item at this address"
      :description="`Check the address and the network (now ${network}). If this is a collection address, open it in the collection explorer.`"
      :actions="[{ label: 'Open as collection', to: `/tools/nft-collection-info?address=${encodeURIComponent(input.trim())}`, color: 'neutral', variant: 'outline' }]"
    />

    <template v-if="v">
      <UAlert v-if="v.trust === 'blacklist'" color="error" variant="subtle" icon="i-lucide-shield-alert" title="Spam or scam NFT" :description="trust.hint" />

      <div class="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div class="space-y-2">
          <div class="relative aspect-square overflow-hidden rounded-lg border border-default bg-elevated">
            <video v-if="showVideo && v.media" :src="v.media" :poster="v.image" class="size-full object-contain" controls autoplay loop muted playsinline />
            <img v-else-if="v.image && !imgFailed" :src="v.image" :alt="v.name" class="size-full object-contain" referrerpolicy="no-referrer" @error="imgFailed = true">
            <div v-else class="flex size-full flex-col items-center justify-center gap-2 text-muted">
              <UIcon name="i-lucide-image-off" class="size-10" />
              <span class="text-xs">No image</span>
            </div>
          </div>
          <UButton v-if="v.media && !showVideo" icon="i-lucide-play" label="Play animation" size="sm" color="neutral" variant="outline" block @click="showVideo = true" />
          <p class="text-xs text-dimmed">
            Images and metadata are hosted off-chain by the creator. Anyone can copy them: the NFT address is what proves authenticity.
          </p>
        </div>

        <div class="min-w-0 space-y-4">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-xl font-semibold text-highlighted break-words">
                {{ v.name }}
              </h2>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <UBadge :color="trust.color" variant="subtle" :label="trust.label" :title="trust.hint" />
              <UBadge v-for="a in v.approvedBy" :key="a" color="neutral" variant="outline" :label="`Approved by ${a}`" />
              <UBadge v-if="v.kind !== 'other'" color="primary" variant="subtle" :label="NFT_KIND_LABELS[v.kind].replace(/s$/, '')" />
              <UBadge v-if="v.isSbt" color="warning" variant="subtle" icon="i-lucide-lock" label="Soulbound (SBT)" />
              <UBadge v-if="v.sale" color="success" variant="solid" label="For sale" />
            </div>
            <p v-if="v.collection" class="mt-2 text-sm text-muted">
              Collection:
              <NuxtLink :to="`/tools/nft-collection-info?address=${collectionFriendly}`" class="text-primary hover:underline">
                {{ v.collection.name }}
              </NuxtLink>
            </p>
            <p v-else class="mt-2 text-sm text-muted">
              Standalone NFT (no collection).
            </p>
            <p v-if="!interfaces" class="mt-2 text-xs text-dimmed">
              Could not check whether this is a soulbound token (toncenter is busy).
            </p>
            <p v-if="v.isSbt" class="mt-2 text-xs text-muted">
              A soulbound token is bound to its owner: it cannot be sold or transferred, only revoked by its issuer or destroyed by the owner.
            </p>
          </div>

          <section v-if="v.sale" class="rounded-lg border border-default p-4">
            <div class="text-xs text-muted">
              Listed on {{ v.sale.market }}
            </div>
            <div class="mt-1 text-2xl font-semibold text-highlighted">
              <TokenAmount :nano="v.sale.price.units" :decimals="v.sale.price.decimals" :symbol="v.sale.price.symbol" :max-decimals="4" />
            </div>
            <p v-if="royalty" class="mt-1 text-xs text-muted">
              Creator royalty from this sale: <TokenAmount :nano="royaltyOn(v.sale.price.units, royalty)" :decimals="v.sale.price.decimals" :symbol="v.sale.price.symbol" :max-decimals="4" />
            </p>
            <div class="mt-2 text-xs text-muted">
              Sale contract: <AddressLink :address="v.sale.contract" />
            </div>
          </section>

          <section>
            <h3 class="text-sm font-semibold text-highlighted">
              Owner
            </h3>
            <div v-if="v.owner" class="mt-1 space-y-1">
              <div v-if="v.owner.name" class="text-sm text-highlighted">
                {{ v.owner.name }}
              </div>
              <AddressLink :address="v.owner.raw" :bounceable="false" />
              <p v-if="v.sale" class="text-xs text-dimmed">
                The item itself sits in the sale contract until it is sold or the listing is cancelled.
              </p>
            </div>
            <p v-else class="mt-1 text-sm text-muted">
              No owner (burned or never initialized).
            </p>
          </section>

          <section>
            <h3 class="text-sm font-semibold text-highlighted">
              Creator royalty
            </h3>
            <div class="mt-1 text-sm">
              <span v-if="royalty === undefined" class="text-muted">Loading…</span>
              <span v-else-if="royalty === null" class="text-muted">{{ v.collection ? 'Not reported: the collection contract does not implement royalty_params (TEP-66).' : 'None (standalone NFT).' }}</span>
              <div v-else class="space-y-1">
                <div class="text-highlighted">
                  {{ royalty.percent }}% <span class="text-xs text-muted">({{ royalty.numerator }} / {{ royalty.denominator }}) of every marketplace sale</span>
                </div>
                <AddressLink v-if="royalty.destination" :address="royalty.destination" :bounceable="false" />
              </div>
            </div>
          </section>

          <KeyValue :items="details" />

          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ExplorerLinks kind="nft" :value="itemFriendly" />
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton :to="`/tools/nft-history?address=${itemFriendly}`" icon="i-lucide-history" label="Ownership history" size="sm" color="neutral" variant="outline" />
            <UButton v-if="v.collection && v.attributes.length" :to="`/tools/nft-rarity?collection=${collectionFriendly}&item=${itemFriendly}`" icon="i-lucide-gem" label="Rarity rank" size="sm" color="neutral" variant="outline" />
          </div>
        </div>
      </div>

      <section v-if="v.attributes.length">
        <h3 class="text-sm font-semibold text-highlighted">
          Attributes
        </h3>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div v-for="a in v.attributes" :key="a.trait + a.value" class="rounded-lg border border-default px-3 py-2">
            <div class="text-xs text-muted">
              {{ a.trait }}
            </div>
            <div class="text-sm font-medium break-words text-highlighted">
              {{ a.value }}
            </div>
          </div>
        </div>
      </section>

      <section v-if="v.description">
        <h3 class="text-sm font-semibold text-highlighted">
          Description
        </h3>
        <p class="mt-1 text-sm whitespace-pre-line break-words text-default">
          {{ v.description }}
        </p>
      </section>

      <JsonView v-if="rawItem" :value="rawItem.metadata" label="Raw metadata" />
    </template>
  </div>
</template>
