<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import MainnetAddress from '~/lib/telegram/MainnetAddress.vue'
import { fragmentNumberUrl, fragmentUsernameUrl, mainnetFriendly, NUMBERS_COLLECTION, USERNAMES_COLLECTION } from '~/lib/telegram/fragment'
import { explorerUrl } from '~/utils/ton/explorers'
import type { AuctionConfig, AuctionState, Query, SalePrice, StackEntry } from './logic'
import { displayName, indexSource, itemIndex, parseAuctionConfig, parseAuctionState, parseQuery, saleSymbol, timeLeft } from './logic'

const EXAMPLES = ['@katrinakaif', '@walletmajor', '+888 0768 4929', '@durov']

interface NftItem {
  address: string
  index: string
  owner_address: string | null
  real_owner?: string | null
  on_sale?: boolean
  sale_contract_address?: string | null
}
interface Transfer { transaction_hash: string, transaction_now: number, old_owner: string | null, new_owner: string | null, transaction_aborted: boolean }
interface Result {
  query: Query
  index: string
  item: NftItem | null
  image?: string
  auction?: AuctionState | null
  config?: AuctionConfig | null
  sale?: { market: string, price: SalePrice } | null
  transfers?: Transfer[]
  partial: string[]
}

// Telegram collectibles exist only on mainnet, whatever the header network switch says.
const tc = useToncenter('mainnet')
const ta = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()

const input = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<Result | null>(null)

const getMethod = (address: string, method: string) => rateLimitedJson<{ exit_code: number, stack: StackEntry[] }>(
  `${tc.baseUrl()}/v3/runGetMethod`,
  { provider: 'toncenter' },
  { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, method, stack: [] }) }
)

async function run() {
  error.value = null
  result.value = null
  let query: Query
  try {
    query = parseQuery(input.value)
  }
  catch (e) {
    error.value = e
    return
  }
  loading.value = true
  try {
    const index = await itemIndex(indexSource(query))
    const res = await tc.v3<{ nft_items: NftItem[], metadata?: Record<string, { token_info?: { image?: string }[] }> }>('nft/items', {
      collection_address: query.kind === 'username' ? USERNAMES_COLLECTION : NUMBERS_COLLECTION,
      index,
      limit: 1
    })
    const item = res.nft_items[0] ?? null
    const r: Result = { query, index, item, partial: [] }
    if (!item) {
      result.value = r
      return
    }
    r.image = res.metadata?.[item.address]?.token_info?.[0]?.image
    result.value = { ...r }

    // Extra details: each failure only hides its own section.
    const tasks: Promise<void>[] = [
      getMethod(item.address, 'get_telemint_auction_state').then(async (s) => {
        r.auction = parseAuctionState(s)
        if (r.auction) r.config = parseAuctionConfig(await getMethod(item.address, 'get_telemint_auction_config'))
      }).catch(() => void r.partial.push('auction status')),
      tc.v3<{ nft_transfers: Transfer[] }>('nft/transfers', { item_address: item.address, limit: 10, sort: 'desc' })
        .then(t => void (r.transfers = t.nft_transfers))
        .catch(() => void r.partial.push('ownership history'))
    ]
    if (item.on_sale) {
      tasks.push(ta.get<{ sale?: { market?: { name?: string }, price: SalePrice } }>(`nfts/${item.address}`)
        .then(n => void (r.sale = n.sale ? { market: n.sale.market?.name ?? 'a marketplace', price: n.sale.price } : null))
        .catch(() => void r.partial.push('sale price')))
    }
    await Promise.all(tasks)
    result.value = { ...r }
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function example(v: string) {
  input.value = v
  run()
}

const name = computed(() => (result.value ? displayName(result.value.query) : ''))
const fragmentUrl = computed(() => {
  const q = result.value?.query
  return q ? (q.kind === 'username' ? fragmentUsernameUrl(q.name) : fragmentNumberUrl(q.digits)) : ''
})
const item = computed(() => result.value?.item ?? null)
const owner = computed(() => item.value?.real_owner ?? item.value?.owner_address ?? null)
const tmeUrl = computed(() => (result.value?.query.kind === 'username' ? `https://t.me/${result.value.query.name}` : null))
const items = computed<KeyValueItem[]>(() => {
  const r = result.value
  if (!r) return []
  return [
    { label: 'NFT index', value: r.index, hint: `sha256("${indexSource(r.query)}") read as a number. This is how Fragment numbers every ${r.query.kind === 'username' ? 'username' : '+888 number'}.` }
  ]
})
const fmtDate = (unix: number) => new Date(unix * 1000).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Telegram username or +888 number" hint="@name, t.me/name or +888 …">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="input"
            placeholder="@username or +888 0000 0000"
            size="lg"
            class="w-full"
            icon="i-lucide-at-sign"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" label="Look up" icon="i-lucide-search" size="lg" :loading="loading" :disabled="!input.trim()" class="justify-center" />
        </div>
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e" :label="e" variant="link" size="sm" class="px-0" @click="example(e)" />
      </div>
    </form>

    <UAlert
      v-if="isTestnet"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Reading mainnet"
      description="Telegram usernames and numbers exist only on TON mainnet, so this tool always reads mainnet."
    />

    <LoadingState v-if="loading && !result" label="Looking up the collectible on toncenter…" />
    <ErrorNotice :error="error" @retry="run" />

    <template v-if="result">
      <!-- Not on-chain -->
      <div v-if="!result.item" class="space-y-3">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-lucide-circle-dashed"
          :title="`${name} is not a collectible on TON`"
          :description="result.query.kind === 'username'
            ? 'No NFT exists for this username. It may be a regular Telegram username (not tradable), it may be free, or Fragment may list it for auction without any bid yet (an NFT is minted with the first bid). Fragment shows its current status.'
            : 'No NFT exists for this number yet. Fragment shows whether it can be bought.'"
        />
        <UButton :to="fragmentUrl" target="_blank" :label="`Check ${name} on Fragment`" trailing-icon="i-lucide-arrow-up-right" variant="soft" />
      </div>

      <!-- Collectible -->
      <template v-else-if="item">
        <div class="flex items-start gap-4">
          <img v-if="result.image" :src="result.image" :alt="name" class="size-16 shrink-0 rounded-lg border border-default bg-elevated sm:size-20">
          <div class="min-w-0 space-y-2">
            <h3 class="font-display text-lg font-semibold break-all text-highlighted">
              {{ name }}
            </h3>
            <div class="flex flex-wrap gap-2">
              <UBadge color="primary" variant="subtle" icon="i-lucide-badge-check" :label="result.query.kind === 'username' ? 'Collectible username' : 'Anonymous number'" />
              <UBadge v-if="result.auction" color="warning" variant="subtle" icon="i-lucide-gavel" :label="timeLeft(result.auction.endTime) === 'ended' ? 'Auction ended' : 'Auction running'" />
              <UBadge v-else-if="item.on_sale" color="success" variant="subtle" icon="i-lucide-tag" label="Listed for sale" />
              <UBadge v-else-if="owner" color="neutral" variant="subtle" icon="i-lucide-lock" label="Not for sale on-chain" />
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton :to="fragmentUrl" target="_blank" label="Fragment" trailing-icon="i-lucide-arrow-up-right" variant="soft" size="sm" />
          <UButton v-if="tmeUrl" :to="tmeUrl" target="_blank" label="Open in Telegram" trailing-icon="i-lucide-arrow-up-right" variant="soft" color="neutral" size="sm" />
          <UButton :to="explorerUrl('getgems', 'nft', mainnetFriendly(item.address), 'mainnet') ?? undefined" target="_blank" label="Getgems" trailing-icon="i-lucide-arrow-up-right" variant="soft" color="neutral" size="sm" />
        </div>

        <!-- Auction -->
        <div v-if="result.auction" class="space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-4">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium text-highlighted">Auction</span>
            <span class="text-sm text-muted">ends {{ fmtDate(result.auction.endTime) }} ({{ timeLeft(result.auction.endTime) }})</span>
          </div>
          <div class="text-sm">
            <template v-if="result.auction.bidder">
              Highest bid <TokenAmount :nano="result.auction.bid" class="text-highlighted" /> by <MainnetAddress :address="result.auction.bidder" />
            </template>
            <template v-else>
              No bids yet. Minimum bid <TokenAmount :nano="result.auction.minBid" class="text-highlighted" />
            </template>
          </div>
          <div v-if="result.config" class="text-xs text-muted">
            <template v-if="result.config.maxBid > 0n">
              Buy now: <TokenAmount :nano="result.config.maxBid" /> ·
            </template>
            Each bid must beat the last by {{ result.config.minBidStepPercent }}%. A late bid keeps the auction open for at least {{ Math.round(result.config.minExtendTime / 60) }} more minutes.
          </div>
        </div>

        <!-- Sale -->
        <div v-if="result.sale" class="rounded-lg border border-success/40 bg-success/5 p-4 text-sm">
          For sale on <span class="font-medium text-highlighted">{{ result.sale.market }}</span> for
          <TokenAmount :nano="result.sale.price.value" :decimals="result.sale.price.decimals ?? 9" :symbol="saleSymbol(result.sale.price, COIN_SYMBOL)" class="text-highlighted" />
        </div>

        <div class="divide-y divide-default">
          <ResultField label="Owner" :value="owner ?? ''" :copy="false" :hint="item.on_sale && item.sale_contract_address ? 'The seller. While listed, the NFT itself sits in the sale contract.' : result.auction && owner ? 'The current owner, who put it up for auction. The auction runs on the NFT itself.' : undefined">
            <MainnetAddress v-if="owner" :address="owner" />
            <span v-else class="text-muted">No owner yet: the first auction by Fragment is still running.</span>
          </ResultField>
          <ResultField v-if="item.on_sale && item.sale_contract_address" label="Sale contract" :value="item.sale_contract_address" :copy="false">
            <MainnetAddress :address="item.sale_contract_address" bounceable />
          </ResultField>
          <ResultField label="NFT item" :value="item.address" :copy="false">
            <MainnetAddress :address="item.address" bounceable />
          </ResultField>
        </div>
        <KeyValue :items="items" />

        <div v-if="result.transfers?.length" class="space-y-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Recent transfers
          </h3>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="t in result.transfers" :key="t.transaction_hash" class="space-y-1 px-3 py-2.5 text-sm">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-muted">{{ fmtDate(t.transaction_now) }}<span v-if="t.transaction_aborted" class="text-error"> · failed</span></span>
                <ExplorerLinks kind="tx" :value="t.transaction_hash" network="mainnet" />
              </div>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <MainnetAddress v-if="t.old_owner" :address="t.old_owner" no-links />
                <span v-else class="text-muted">minted</span>
                <UIcon name="i-lucide-arrow-right" class="size-4 text-dimmed" />
                <MainnetAddress v-if="t.new_owner" :address="t.new_owner" no-links />
              </div>
            </li>
          </ul>
        </div>
        <LoadingState v-else-if="loading" label="Reading auction, sale and history…" />

        <UAlert
          v-if="result.partial.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`Could not load: ${result.partial.join(', ')}`"
          description="The public API is busy. Run the lookup again in a few seconds."
        />
        <p class="text-xs text-muted">
          Fragment also runs auctions and offers off-chain (before the first bid). The Fragment page is the source of truth for those.
        </p>
      </template>
    </template>
  </div>
</template>
