<script setup lang="ts">
import type { TonapiCollection } from '~/lib/nfts-read/core'
import { cachedCollectionItems, friendly, parseNftQuery, previewUrl } from '~/lib/nfts-read/core'
import type { RankedItem, RarityResult } from './logic'
import { computeRarity, csvRows, findItem, NONE, topPercent } from './logic'

const EXAMPLES = [
  { label: 'TON Diamonds', value: 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir' },
  { label: 'Vintage Cigars (Telegram gift)', value: 'EQACcQpR2fmdeENWdE2YGQWHVxSTyA8Zq4_k7rk_IaxCRXNe' }
]
/** Same cap as the collection explorer, so both share one download per session. */
const MAX_ITEMS = 20000
const LIST_STEP = 50

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const tc = useToncenter()

const input = ref(typeof route.query.collection === 'string' ? route.query.collection : '')
const query = computed(() => parseNftQuery(input.value))
const itemInput = ref(typeof route.query.item === 'string' ? route.query.item : '')

const loading = ref(false)
const progress = ref(0)
const error = ref<unknown>(null)
const col = ref<TonapiCollection | null>(null)
const result = ref<RarityResult | null>(null)
const complete = ref(true)
const shownCount = ref(LIST_STEP)
const selected = ref<RankedItem | null>(null)
let runId = 0

async function run() {
  const q = query.value
  if (q.kind !== 'address') return
  const id = ++runId
  loading.value = true
  error.value = null
  result.value = null
  selected.value = null
  col.value = null
  progress.value = 0
  shownCount.value = LIST_STEP
  router.replace({ query: { ...route.query, collection: input.value.trim(), item: itemInput.value.trim() || undefined } })
  try {
    // Name and image are nice to have; the ranking only needs toncenter.
    tonapi.get<TonapiCollection>(`nfts/collections/${q.raw}`).then(c => id === runId && (col.value = c), () => {})
    const res = await cachedCollectionItems(network.value, q.raw, MAX_ITEMS, tc.v3, {
      onProgress: n => id === runId && (progress.value = n),
      cancelled: () => id !== runId
    })
    if (id !== runId) return
    complete.value = res.complete
    result.value = computeRarity(res.items)
    lookupItem()
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

const itemQuery = computed(() => parseNftQuery(itemInput.value))
const itemMissing = ref(false)
function lookupItem() {
  itemMissing.value = false
  if (!result.value || !itemInput.value.trim()) return
  const q = itemQuery.value
  selected.value = findItem(result.value, itemInput.value, q.kind === 'address' ? q.raw : null) ?? null
  itemMissing.value = !selected.value
  if (selected.value) router.replace({ query: { ...route.query, item: itemInput.value.trim() } })
}

function pick(r: RankedItem) {
  selected.value = r
  itemInput.value = r.item.name ?? r.item.index
  itemMissing.value = false
  if (import.meta.client) document.getElementById('rarity-item')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

watch(network, () => result.value && run())
onMounted(() => query.value.kind === 'address' && run())

function tryExample(v: string) {
  input.value = v
  itemInput.value = ''
  run()
}

const r = computed(() => result.value)
const name = computed(() => col.value?.metadata?.name || 'this collection')
const avatar = computed(() => previewUrl(col.value?.previews, '100x100', col.value?.metadata?.image))
const csv = computed(() => (r.value ? csvRows(r.value, raw => friendly(raw, { testnet: isTestnet.value })) : []))
const colFriendly = computed(() => (query.value.kind === 'address' ? friendly(query.value.raw, { testnet: isTestnet.value }) : ''))
function itemLink(raw: string) {
  return `/tools/nft-viewer?address=${friendly(raw, { testnet: isTestnet.value })}`
}
const failed = reactive(new Set<string>())
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
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
          <UButton type="submit" size="lg" icon="i-lucide-gem" label="Rank" :loading="loading" :disabled="query.kind !== 'address'" />
        </div>
      </UFormField>
      <div v-if="!isTestnet" class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="`Reading items… ${progress.toLocaleString('en-US')} loaded (about 1 s per 1,000)`" />
    <ErrorNotice :error="error" title="Could not load the collection" @retry="run" />

    <template v-if="r">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <img v-if="avatar" :src="avatar" alt="" class="size-10 rounded-md border border-default object-cover" referrerpolicy="no-referrer">
          <div class="min-w-0">
            <NuxtLink :to="`/tools/nft-collection-info?address=${colFriendly}`" class="font-display font-semibold break-words text-highlighted hover:text-primary">
              {{ name }}
            </NuxtLink>
            <p class="text-xs text-muted">
              {{ r.ranked.length.toLocaleString('en-US') }} items ranked over {{ r.traitTypes.length }} trait types<template v-if="r.skipped">
                · {{ r.skipped.toLocaleString('en-US') }} without attributes left out
              </template>
            </p>
          </div>
        </div>
        <CsvExportButton :rows="csv" :filename="`rarity-${colFriendly}`" label="Export ranking" />
      </div>

      <UAlert v-if="!complete" color="warning" variant="subtle" icon="i-lucide-info" :title="`Ranked the first ${MAX_ITEMS.toLocaleString('en-US')} items only`" description="The collection is larger than this tool reads in the browser. Scores are relative to the items read, so ranks are approximate." />
      <UAlert v-if="!r.ranked.length" color="neutral" variant="subtle" icon="i-lucide-inbox" title="No traits to rank" description="Items of this collection have no attributes in their metadata (or the indexer has not read it yet), so there is nothing to score." />

      <template v-else>
        <form id="rarity-item" class="space-y-1" @submit.prevent="lookupItem">
          <UFormField label="Find an item" hint="Name, number (#12) or NFT address" :error="itemMissing ? 'No item with this name, number or address among the ranked items.' : undefined">
            <div class="flex gap-2">
              <UInput v-model="itemInput" placeholder="#12 or EQ…" class="min-w-0 flex-1" :ui="{ base: 'font-mono text-sm' }" autocomplete="off" spellcheck="false" />
              <UButton type="submit" icon="i-lucide-search" label="Find" color="neutral" variant="outline" />
            </div>
          </UFormField>
        </form>

        <section v-if="selected" class="space-y-3 rounded-lg border border-default p-4">
          <div class="flex flex-wrap items-start gap-4">
            <img v-if="selected.item.image && !failed.has(selected.item.raw)" :src="selected.item.image" :alt="selected.item.name" class="size-24 rounded-lg border border-default object-cover" referrerpolicy="no-referrer" @error="failed.add(selected.item.raw)">
            <div class="min-w-0 flex-1">
              <NuxtLink :to="itemLink(selected.item.raw)" class="font-display text-lg font-semibold break-words text-highlighted hover:text-primary">
                {{ selected.item.name ?? `#${selected.item.index}` }}
              </NuxtLink>
              <div class="mt-1 text-2xl font-semibold text-primary">
                Rank #{{ selected.rank.toLocaleString('en-US') }}
                <span class="text-sm font-normal text-muted">of {{ r.ranked.length.toLocaleString('en-US') }} · top {{ topPercent(selected.rank, r.ranked.length) }}</span>
              </div>
              <div class="text-xs text-muted">
                Rarity score {{ selected.score.toFixed(2) }}
              </div>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs text-muted">
                  <th class="py-1 pr-2 sm:pr-3 font-medium">
                    Trait
                  </th>
                  <th class="py-1 pr-2 sm:pr-3 font-medium">
                    Value
                  </th>
                  <th class="py-1 pr-2 sm:pr-3 text-right font-medium">
                    <span class="sm:hidden">Items</span><span class="hidden sm:inline">Items with it</span>
                  </th>
                  <th class="py-1 text-right font-medium">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="t in [...selected.traits].sort((a, b) => b.score - a.score)" :key="t.trait">
                  <td class="py-1.5 pr-2 sm:pr-3 text-muted">
                    {{ t.trait }}
                  </td>
                  <td class="py-1.5 pr-2 sm:pr-3 text-highlighted" :class="t.value === NONE && 'italic text-muted'">
                    {{ t.value }}
                  </td>
                  <td class="py-1.5 pr-2 sm:pr-3 text-right whitespace-nowrap">
                    {{ t.count.toLocaleString('en-US') }} <span class="hidden text-xs text-muted sm:inline">({{ (t.frequency * 100).toFixed(t.frequency < 0.01 ? 2 : 1) }}%)</span>
                  </td>
                  <td class="py-1.5 text-right">
                    {{ t.score.toFixed(2) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="space-y-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Rarest items
          </h3>
          <ol class="divide-y divide-default rounded-lg border border-default">
            <li v-for="x in r.ranked.slice(0, shownCount)" :key="x.item.raw">
              <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-elevated" @click="pick(x)">
                <span class="w-12 shrink-0 text-sm font-semibold text-primary">#{{ x.rank }}</span>
                <img v-if="x.item.image && !failed.has(x.item.raw)" :src="x.item.image" alt="" loading="lazy" class="size-9 shrink-0 rounded-md border border-default object-cover" referrerpolicy="no-referrer" @error="failed.add(x.item.raw)">
                <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ x.item.name ?? `#${x.item.index}` }}</span>
                <span class="text-xs text-muted">{{ x.score.toFixed(2) }}</span>
              </button>
            </li>
          </ol>
          <UButton v-if="shownCount < r.ranked.length" label="Show more" icon="i-lucide-chevrons-down" color="neutral" variant="outline" block @click="shownCount += LIST_STEP" />
        </section>

        <p class="text-xs text-dimmed">
          Statistical rarity, as on rarity.tools: each trait adds (items in the set ÷ items sharing that value), and a trait an item lacks counts as "{{ NONE }}". Marketplaces may use other formulas, so their ranks can differ. Metadata is read from the toncenter indexer.
        </p>
      </template>
    </template>
  </div>
</template>
