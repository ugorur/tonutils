<script setup lang="ts">
import { Address } from '@ton/core'
import { csvRows, LEVELS, listUrl, mergeRows, PAGE_SIZE, pct, SORTS, toRows, usd, type ApiJetton, type SortKey, type TokenRow, type VerificationLevel } from './logic'

const { isTestnet } = useTonNetwork()

const search = ref('')
const sort = ref<SortKey>('TVL')
const level = ref<VerificationLevel>('verified')
const rows = ref<TokenRow[]>([])
const page = ref(1)
const more = ref(true)
const loading = ref(false)
const error = ref<Error | null>(null)
let runId = 0

async function fetchPage(reset: boolean) {
  const id = ++runId
  loading.value = true
  error.value = null
  const p = reset ? 1 : page.value + 1
  try {
    const items = await $fetch<ApiJetton[]>(listUrl({ search: search.value, sort: sort.value, level: level.value, page: p }))
    if (id !== runId) return
    const next = toRows(items)
    rows.value = reset ? next : mergeRows(rows.value, next)
    page.value = p
    // Searches return one page; browse pages stop at 100 (API limit).
    more.value = !search.value.trim() && items.length >= PAGE_SIZE && p < 100
  }
  catch (e) {
    if (id !== runId) return
    // A failed new search/sort must not leave the previous results under the new query.
    if (reset) rows.value = []
    const status = (e as { statusCode?: number }).statusCode
    error.value = new Error(`The token directory (swap.coffee) did not answer${status ? ` (HTTP ${status})` : ''}. Try again in a moment.`)
  }
  finally {
    if (id === runId) loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => fetchPage(true), 400)
})
watch([sort, level], () => fetchPage(true))
onMounted(() => {
  if (!isTestnet.value) fetchPage(true)
})
watch(isTestnet, t => (t ? (rows.value = []) : fetchPage(true)))

const friendly = (raw: string) => Address.parse(raw).toString({ bounceable: true, urlSafe: true })
const broken = ref(new Set<string>())
const hasInfo = computed(() => !!getTool('jetton-info'))
const exportRows = computed(() => csvRows(rows.value, friendly))

const BADGE: Record<TokenRow['verification'], { label: string, cls: string, icon: string }> = {
  verified: { label: 'Verified', cls: 'text-success', icon: 'i-lucide-badge-check' },
  community: { label: 'Community listed', cls: 'text-info', icon: 'i-lucide-users' },
  unverified: { label: 'Unverified', cls: 'text-dimmed', icon: 'i-lucide-circle-help' },
  scam: { label: 'Flagged as scam', cls: 'text-error', icon: 'i-lucide-shield-alert' }
}

const badge = (v: TokenRow['verification']) => BADGE[v]

const columns = [
  { accessorKey: 'rank', header: '#' },
  { accessorKey: 'token', header: 'Token' },
  { accessorKey: 'price', header: 'Price' },
  { accessorKey: 'change24h', header: '24h' },
  { accessorKey: 'mcap', header: 'Market cap' },
  { accessorKey: 'tvl', header: 'Liquidity' },
  { accessorKey: 'volume24h', header: 'Volume 24h' },
  { accessorKey: 'holders', header: 'Holders' },
  { accessorKey: 'links', header: '' }
]
const data = computed(() => rows.value.map((r, i) => ({ ...r, rank: i + 1 })))
</script>

<template>
  <div class="space-y-5">
    <UAlert
      v-if="isTestnet"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Mainnet only"
      description="The token directory lists mainnet jettons. Switch to mainnet in the header to browse it."
    />

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search name, symbol or address" class="w-full" autocomplete="off" spellcheck="false" aria-label="Search tokens" />
        <USelect v-model="sort" :items="SORTS" :disabled="!!search.trim()" class="w-full sm:w-48" aria-label="Sort by" />
        <USelect v-model="level" :items="LEVELS" class="w-full sm:w-56" aria-label="Verification" />
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <UButton label="Try a search: dogs" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="search = 'dogs'" />
          <span v-if="search.trim()" class="text-xs text-muted">Search results are ranked by relevance and always include community-listed tokens.</span>
        </div>
        <CsvExportButton :rows="exportRows" filename="ton-tokens" />
      </div>

      <!-- Not ErrorNotice: its retry button only appears for toncenter/tonapi errors. -->
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Could not load tokens"
        :description="error.message"
        :actions="[{ label: 'Try again', color: 'error', variant: 'outline', icon: 'i-lucide-rotate-cw', onClick: () => fetchPage(rows.length === 0) }]"
      />
      <LoadingState v-if="loading && !rows.length" label="Loading tokens…" />

      <UTable v-if="rows.length || (!loading && !error)" :data="data" :columns="columns" sticky class="max-h-[42rem]" :ui="{ td: 'py-2', th: 'py-2' }">
        <template #token-cell="{ row }">
          <div class="flex min-w-48 items-center gap-2.5">
            <img v-if="row.original.image && !broken.has(row.original.image)" :src="row.original.image" alt="" loading="lazy" class="size-8 shrink-0 rounded-full bg-elevated object-cover" referrerpolicy="no-referrer" @error="broken = new Set(broken).add(row.original.image)">
            <div v-else class="size-8 shrink-0 rounded-full bg-elevated" />
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="font-medium text-highlighted">{{ row.original.symbol }}</span>
                <UTooltip :text="badge(row.original.verification).label">
                  <UIcon :name="badge(row.original.verification).icon" class="size-4" :class="badge(row.original.verification).cls" :aria-label="badge(row.original.verification).label" />
                </UTooltip>
              </div>
              <div class="max-w-48 truncate text-xs text-muted">
                {{ row.original.name }}
              </div>
            </div>
          </div>
        </template>
        <template #price-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ usd(row.original.price) }}</span>
        </template>
        <template #change24h-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums" :class="(row.original.change24h ?? 0) > 0 ? 'text-success' : (row.original.change24h ?? 0) < 0 ? 'text-error' : 'text-muted'">{{ pct(row.original.change24h) }}</span>
        </template>
        <template #mcap-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ usd(row.original.mcap) }}</span>
        </template>
        <template #tvl-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ usd(row.original.tvl) }}</span>
        </template>
        <template #volume24h-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ usd(row.original.volume24h) }}</span>
        </template>
        <template #holders-cell="{ row }">
          <span class="whitespace-nowrap tabular-nums">{{ row.original.holders?.toLocaleString('en-US') ?? '—' }}</span>
        </template>
        <template #links-cell="{ row }">
          <div v-if="!row.original.native" class="flex items-center gap-1">
            <CopyButton :value="friendly(row.original.raw)" label="Copy master address" size="xs" />
            <UButton v-if="hasInfo" :to="`/tools/jetton-info?q=${friendly(row.original.raw)}`" icon="i-lucide-info" size="xs" variant="ghost" color="neutral" aria-label="Token info" title="Token info" />
            <UButton :to="`/tools/holders-snapshot?q=${friendly(row.original.raw)}`" icon="i-lucide-camera" size="xs" variant="ghost" color="neutral" aria-label="Holders snapshot" title="Holders snapshot" />
            <UButton :href="`https://tonviewer.com/${friendly(row.original.raw)}`" target="_blank" rel="noopener" icon="i-lucide-arrow-up-right" size="xs" variant="ghost" color="neutral" aria-label="Open in Tonviewer" title="Open in Tonviewer" />
          </div>
          <span v-else class="text-xs text-muted">native coin</span>
        </template>
        <template #empty>
          <span class="text-sm text-muted">No tokens match. Try “All, including unverified”.</span>
        </template>
      </UTable>

      <div v-if="more && rows.length" class="flex justify-center">
        <UButton label="Load more" icon="i-lucide-chevrons-down" variant="outline" color="neutral" :loading="loading" @click="fetchPage(false)" />
      </div>

      <p class="text-xs text-dimmed">
        Data: swap.coffee token API (prices, liquidity, holders, verification), refreshed every minute. “Verified” means reviewed by swap.coffee; anyone can create a token with any name and logo, so always compare the master address. Prices in USD; {{ COIN_RENAME_NOTE }}
      </p>
    </template>
  </div>
</template>
