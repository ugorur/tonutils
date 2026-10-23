<script setup lang="ts">
import MainnetAddress from '~/lib/telegram/MainnetAddress.vue'
import { mainnetFriendly } from '~/lib/telegram/fragment'
import type { Collectible, Summary, TonapiNft } from './logic'
import { KIND_LABEL, parseOwner, summarize } from './logic'

const EXAMPLE = 'UQBV8kYGxoQ6n-CbhgPKpxuqHoYeC3vd7kuTbu0OPvMF9bwQ'
const PAGE = 1000
const MAX_PAGES = 5
const SCAM_SHOWN = 10

// Telegram collectibles exist only on mainnet, whatever the header network switch says.
const ta = useTonapi('mainnet')
const { isTestnet } = useTonNetwork()
const { wallet } = useTonConnect()

const input = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<{ owner: string, total: number, truncated: boolean, summary: Summary } | null>(null)

async function run() {
  error.value = null
  result.value = null
  let owner: string
  try {
    owner = parseOwner(input.value)
  }
  catch (e) {
    error.value = e
    return
  }
  loading.value = true
  try {
    const nfts: TonapiNft[] = []
    let truncated = false
    for (let page = 0; ; page++) {
      // indirect_ownership: include items the wallet listed for sale (held by a sale contract).
      const r = await ta.get<{ nft_items: TonapiNft[] }>(`accounts/${owner}/nfts`, { indirect_ownership: true, limit: PAGE, offset: page * PAGE })
      nfts.push(...r.nft_items)
      if (r.nft_items.length < PAGE) break
      if (page + 1 >= MAX_PAGES) {
        truncated = true
        break
      }
    }
    result.value = { owner, total: nfts.length, truncated, summary: summarize(nfts) }
  }
  catch (e) {
    // tonapi answers 400/404 "entity not found" for a .ton domain that does not resolve
    error.value = owner.endsWith('.ton') && e instanceof TonApiError && (e.status === 400 || e.status === 404)
      ? new Error(`${owner} does not resolve to a wallet. Check the spelling, or paste the address instead.`)
      : e
  }
  finally {
    loading.value = false
  }
}

function use(v: string) {
  input.value = v
  run()
}

const s = computed(() => result.value?.summary)
const tiles = computed(() => {
  const x = s.value
  if (!x) return []
  return [
    { label: 'Usernames', value: x.usernames.length, icon: 'i-lucide-at-sign' },
    { label: '+888 numbers', value: x.numbers.length, icon: 'i-lucide-phone' },
    { label: 'Gifts', value: x.giftCount, icon: 'i-lucide-gift' },
    { label: 'Listed for sale', value: x.listed, icon: 'i-lucide-tag' }
  ]
})
const empty = computed(() => !!s.value && !s.value.usernames.length && !s.value.numbers.length && !s.value.giftCount)
const sections = computed(() => {
  const x = s.value
  if (!x) return []
  return [
    { title: 'Usernames', items: x.usernames },
    { title: 'Anonymous numbers', items: x.numbers }
  ].filter(g => g.items.length)
})

const csvRows = computed<CsvRow[]>(() => {
  const x = s.value
  if (!x) return []
  return [...x.usernames, ...x.numbers, ...x.gifts.flatMap(g => g.items)].map(c => ({
    type: KIND_LABEL[c.kind],
    name: c.name,
    collection: c.collection,
    nft_address: mainnetFriendly(c.address),
    listed_price: c.sale ? formatAmount(c.sale.nano, c.sale.decimals, { group: false }) : '',
    listed_currency: c.sale ? (c.sale.symbol ?? COIN_SYMBOL) : '',
    marketplace: c.sale?.market ?? '',
    fragment_url: c.url ?? ''
  }))
})
const itemLink = (c: Collectible) => c.url ?? `https://tonviewer.com/${mainnetFriendly(c.address)}`
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Wallet address or .ton domain">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="input"
            placeholder="UQ…, EQ…, 0:… or name.ton"
            size="lg"
            class="w-full"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" label="Show collectibles" icon="i-lucide-gift" size="lg" :loading="loading" :disabled="!input.trim()" class="justify-center" />
        </div>
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton label="A collector wallet" variant="link" size="sm" class="px-0" @click="use(EXAMPLE)" />
        <UButton v-if="wallet && !isTestnet" label="My connected wallet" icon="i-lucide-wallet" variant="link" size="sm" class="px-0" @click="use(wallet.friendly)" />
      </div>
    </form>

    <UAlert
      v-if="isTestnet"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Reading mainnet"
      description="Telegram usernames, numbers and gifts exist only on TON mainnet, so this tool always reads mainnet."
    />

    <LoadingState v-if="loading" label="Reading the wallet's NFTs from tonapi…" />
    <ErrorNotice :error="error" @retry="run" />

    <template v-if="result && s">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm text-muted">
          <template v-if="result.owner.endsWith('.ton')">
            {{ result.owner }} ·
          </template>
          <MainnetAddress v-else :address="result.owner" /> {{ result.total }} NFT{{ result.total === 1 ? '' : 's' }} in total
        </div>
        <CsvExportButton :rows="csvRows" filename="telegram-collectibles" />
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="t in tiles" :key="t.label" class="rounded-lg border border-default p-3">
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon :name="t.icon" class="size-3.5" />{{ t.label }}
          </div>
          <div class="mt-1 font-display text-xl font-semibold text-highlighted">
            {{ t.value }}
          </div>
        </div>
      </div>
      <p v-if="s.listed" class="text-sm text-muted">
        Items listed for {{ COIN_SYMBOL }} ask <TokenAmount :nano="s.listedNativeNano" class="text-highlighted" /> in total on marketplaces.
      </p>

      <UAlert
        v-if="s.scams.length"
        color="error"
        variant="subtle"
        icon="i-lucide-shield-alert"
        :title="`${s.scams.length} scam NFT${s.scams.length === 1 ? '' : 's'} in this wallet`"
      >
        <template #description>
          <p>tonapi flags these as scams. Many pretend to be Telegram items, vouchers or airdrops. Do not visit their links, "burn" them on their sites or connect your wallet anywhere they suggest. Ignoring them is safe.</p>
          <ul class="mt-2 list-disc space-y-0.5 pl-5">
            <li v-for="c in s.scams.slice(0, SCAM_SHOWN)" :key="c.address" class="break-all">
              {{ c.name }} <span v-if="c.collection" class="text-muted">({{ c.collection }})</span>
            </li>
          </ul>
          <p v-if="s.scams.length > SCAM_SHOWN" class="mt-1 text-muted">
            …and {{ s.scams.length - SCAM_SHOWN }} more.
          </p>
        </template>
      </UAlert>

      <UAlert
        v-if="empty"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-dashed"
        title="No Telegram collectibles here"
        description="This wallet holds no Fragment usernames, +888 numbers or Telegram gift NFTs on-chain. Gifts kept inside Telegram (not withdrawn to TON) do not appear on the blockchain."
      />

      <section v-for="g in sections" :key="g.title" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          {{ g.title }} ({{ g.items.length }})
        </h3>
        <ul class="grid gap-2 sm:grid-cols-2">
          <li v-for="c in g.items" :key="c.address" class="flex items-center gap-3 rounded-lg border border-default px-3 py-2">
            <img v-if="c.image" :src="c.image" alt="" class="size-10 shrink-0 rounded-md bg-elevated" loading="lazy">
            <div class="min-w-0 flex-1">
              <a :href="itemLink(c)" target="_blank" rel="noopener" class="font-medium break-all text-highlighted hover:text-primary">{{ c.name }}</a>
              <div v-if="c.sale" class="text-xs text-success">
                For sale: <TokenAmount :nano="c.sale.nano" :decimals="c.sale.decimals" :symbol="c.sale.symbol ?? COIN_SYMBOL" /> on {{ c.sale.market }}
              </div>
            </div>
            <CopyButton :value="mainnetFriendly(c.address)" size="xs" />
          </li>
        </ul>
      </section>

      <section v-if="s.gifts.length" class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Gifts ({{ s.giftCount }})
        </h3>
        <details v-for="g in s.gifts" :key="g.collection" class="group rounded-lg border border-default" :open="s.gifts.length <= 3">
          <summary class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-highlighted">
            {{ g.collection }} · {{ g.items.length }}
            <UIcon name="i-lucide-chevron-down" class="size-4 transition group-open:rotate-180" />
          </summary>
          <div class="grid gap-2 border-t border-default p-3 sm:grid-cols-2">
            <a v-for="c in g.items" :key="c.address" :href="itemLink(c)" target="_blank" rel="noopener" class="flex gap-3 rounded-md p-2 hover:bg-elevated">
              <img v-if="c.image" :src="c.image" alt="" class="size-14 shrink-0 rounded-md bg-elevated" loading="lazy">
              <div class="min-w-0 text-sm">
                <div class="font-medium text-highlighted">{{ c.name }}</div>
                <div v-for="t in c.traits" :key="t.name" class="truncate text-xs text-muted">{{ t.name }}: {{ t.value }}</div>
                <div v-if="c.sale" class="text-xs text-success">
                  For sale: <TokenAmount :nano="c.sale.nano" :decimals="c.sale.decimals" :symbol="c.sale.symbol ?? COIN_SYMBOL" />
                </div>
              </div>
            </a>
          </div>
        </details>
      </section>

      <p class="text-xs text-muted">
        <template v-if="s.otherCount">
          {{ s.otherCount }} other NFT{{ s.otherCount === 1 ? '' : 's' }} not shown (see <NuxtLink to="/tools/portfolio" class="text-primary hover:underline">Portfolio</NuxtLink>).
        </template>
        <template v-if="result.truncated">
          Only the first {{ PAGE * MAX_PAGES }} NFTs were read.
        </template>
        Floor prices are not shown: no free public API offers them. Gifts are matched by their contract code plus tonapi's trusted list.
      </p>
    </template>
  </div>
</template>
