<script setup lang="ts">
import { fetchAccountStates, resolveName, useAccountClients } from '~/lib/accounts/api'
import type { TonapiJettonBalance, TonapiPrice } from '~/lib/accounts/core'
import { FIAT_CURRENCIES, formatFiat, formatPercent, friendly, parseAccountList, pickRate } from '~/lib/accounts/core'
import { useFiatCurrency } from '~/lib/accounts/prefs'
import { loadWatchlist } from '~/lib/accounts/watchlist'
import type { AccountInput, Period, PortfolioRow, TonapiNominatorPool } from './logic'
import { buildPortfolio, MAX_ACCOUNTS } from './logic'

// TON Foundation wallet (via its .ton name), a Tonkeeper Queue #1 nominator, and a tsTON holder: all real mainnet accounts.
const EXAMPLE = [
  'foundation.ton',
  'UQAtw6xDcJKE9xoY9Ke1T5EubKIaugpAw3OAfL2GCY8wKSt2, staker',
  '0:9e5de3ae2cffbec44aea7f2d93a95f7b7d438cc81fd0b51c6dc7166350a3e242, liquid staker'
].join('\n')
const ALL_CURRENCIES = FIAT_CURRENCIES.join(',').toLowerCase()

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const { currency, items: currencyItems } = useFiatCurrency()
const clients = useAccountClients(network)

const text = ref(typeof route.query.address === 'string' ? route.query.address : '')
const period = ref<Period>('24h')
const includeUnverified = ref(false)
const showSmall = ref(false)

const parsed = computed(() => parseAccountList(text.value))
const usable = computed(() => parsed.value.filter(r => !r.error && !r.duplicateOf))
const problems = computed(() => parsed.value.filter(r => r.error))
const watchCount = ref(0)
onMounted(() => {
  watchCount.value = loadWatchlist(network.value).length
  if (usable.value.length) run()
})

const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const warnings = ref<string[]>([])
const accounts = ref<AccountInput[]>([])
const tonPrice = ref<TonapiPrice>()
const poolNames = ref<Record<string, string>>({})
let runId = 0

async function run() {
  const id = ++runId
  const list = usable.value.slice(0, MAX_ACCOUNTS)
  if (!list.length) return
  loading.value = true
  error.value = null
  warnings.value = []
  accounts.value = []
  const warn = (w: string) => id === runId && warnings.value.push(w)
  try {
    // 1. names -> addresses
    const resolved: { raw: string, label: string }[] = []
    for (const r of list) {
      if (r.raw) {
        resolved.push({ raw: r.raw, label: r.label })
        continue
      }
      progress.value = `Resolving ${r.domain}…`
      try {
        resolved.push({ raw: await resolveName(r.domain!, clients), label: r.label || r.domain! })
      }
      catch (e) {
        warn((e as Error).message)
      }
    }
    if (id !== runId) return
    const raws = [...new Set(resolved.map(r => r.raw))]
    if (!raws.length) throw new Error('None of the entries could be resolved to an address.')

    // 2. exact GRAM balances + price (toncenter and tonapi queues run in parallel)
    progress.value = 'Loading balances and prices…'
    const pricePromise = isTestnet.value
      ? Promise.resolve(undefined)
      // .catch (not a then() rejection handler) so a malformed response also ends up as a warning.
      : clients.tonapi<{ rates: Record<string, TonapiPrice> }>('rates', { tokens: 'ton', currencies: ALL_CURRENCIES }).then(r => r.rates.TON).catch(() => {
          warn(`${COIN_SYMBOL} price is unavailable right now, so fiat values are missing.`)
          return undefined
        })
    const { states } = await fetchAccountStates(raws, clients)
    tonPrice.value = await pricePromise
    if (id !== runId) return

    // 3. jettons and staking per account (tonapi, ~1 request per second)
    const out: AccountInput[] = []
    for (const [i, raw] of raws.entries()) {
      const st = states.get(raw)
      const label = resolved.find(r => r.raw === raw)?.label || st?.name || ''
      progress.value = `Loading tokens and staking ${i + 1} / ${raws.length}…`
      const [jettons, staking] = await Promise.all([
        clients.tonapi<{ balances: TonapiJettonBalance[] }>(`accounts/${raw}/jettons`, { currencies: ALL_CURRENCIES }).then(r => r.balances, () => {
          warn(`Tokens for ${label || friendly(raw, { testnet: isTestnet.value })} could not be loaded.`)
          return []
        }),
        clients.tonapi<{ pools: TonapiNominatorPool[] }>(`staking/nominator/${raw}/pools`).then(r => r.pools, (e) => {
          // tonapi answers 404 "entity not found" for an account that never existed: nothing staked.
          if ((e as { status?: number }).status === 404) return []
          warn(`Staking for ${label || friendly(raw, { testnet: isTestnet.value })} could not be loaded.`)
          return []
        })
      ])
      if (id !== runId) return
      out.push({ raw, label, nano: st?.balance ?? 0n, jettons, staking })
      accounts.value = [...out]
    }

    // 4. pool names, only when something is staked
    const pools = new Set(out.flatMap(a => a.staking.map(p => p.pool.toLowerCase())))
    if (pools.size) {
      progress.value = 'Loading pool names…'
      await clients.tonapi<{ pools: { address: string, name: string }[] }>('staking/pools').then((r) => {
        if (id === runId) poolNames.value = Object.fromEntries(r.pools.map(p => [p.address.toLowerCase(), p.name]))
      }, () => {})
    }
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

watch(network, () => {
  watchCount.value = loadWatchlist(network.value).length
  if (accounts.value.length) run()
})

function useWatchlist() {
  text.value = loadWatchlist(network.value).map(i => `${i.raw}${i.label ? `, ${i.label}` : ''}`).join('\n')
  run()
}
function tryExample() {
  text.value = EXAMPLE
  run()
}

const rate = computed(() => pickRate(tonPrice.value, currency.value))
const portfolio = computed(() => accounts.value.length
  ? buildPortfolio(accounts.value, rate.value, currency.value, { includeUnverified: includeUnverified.value, poolNames: poolNames.value })
  : null)
const showFiat = computed(() => !isTestnet.value && !!rate.value)
const change = computed(() => portfolio.value?.change[period.value])
// Dust: verified jettons worth under 1 unit of the currency (or unpriced) are folded away by default.
const isSmall = (r: PortfolioRow) => r.kind === 'jetton' && (r.value ?? 0) < 1
const shownRows = computed(() => !portfolio.value ? [] : showSmall.value || !showFiat.value ? portfolio.value.rows : portfolio.value.rows.filter(r => !isSmall(r)))
const smallCount = computed(() => showFiat.value ? portfolio.value?.rows.filter(isSmall).length ?? 0 : 0)

// Phones show only asset + value; the amount moves under the asset name.
const wide = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }
const columns = [
  { accessorKey: 'name', header: 'Asset' },
  { accessorKey: 'units', header: 'Amount', meta: wide },
  { accessorKey: 'price', header: 'Price', meta: wide },
  { accessorKey: 'change', header: 'Change', meta: wide },
  { accessorKey: 'value', header: 'Value' }
]
const accountColumns = [
  { accessorKey: 'raw', header: 'Account' },
  { accessorKey: 'coin', header: COIN_SYMBOL, meta: wide },
  { accessorKey: 'tokens', header: 'Tokens', meta: wide },
  { accessorKey: 'staked', header: 'Staked', meta: wide },
  { accessorKey: 'total', header: 'Total' }
]

function rowDiff(r: PortfolioRow) {
  return period.value === '24h' ? r.rate?.diff24h : period.value === '7d' ? r.rate?.diff7d : r.rate?.diff30d
}
function share(r: PortfolioRow) {
  return portfolio.value?.total && r.value ? `${((r.value / portfolio.value.total) * 100).toFixed(1)}%` : ''
}

const csvRows = computed(() => (portfolio.value ? [...portfolio.value.rows, ...portfolio.value.unverified] : []).map(r => ({
  asset: r.name,
  symbol: r.symbol,
  type: r.kind,
  verified: r.verification === 'whitelist' ? 'yes' : 'no',
  master: r.kind === 'jetton' ? friendly(r.master, { wallet: false, testnet: isTestnet.value }) : '',
  amount: formatAmount(r.units, r.decimals, { group: false }),
  [`price_${currency.value}`]: r.rate?.price ?? '',
  [`value_${currency.value}`]: r.value ?? '',
  [`change_${period.value}`]: rowDiff(r) ?? ''
})))
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="Wallets" :hint="`Up to ${MAX_ACCOUNTS}, one per line`" help="Address (EQ…, UQ…, 0:…) or a .ton / .t.me name. Anything after a comma is used as a label.">
        <UTextarea
          v-model="text"
          :rows="3"
          autoresize
          :maxrows="10"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="UQ…, my main wallet&#10;foundation.ton"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton label="Show portfolio" icon="i-lucide-chart-pie" :loading="loading" :disabled="!usable.length" @click="run" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
        <UButton v-if="watchCount" :label="`Use my watchlist (${watchCount})`" icon="i-lucide-bookmark" variant="link" size="sm" class="px-0" @click="useWatchlist" />
      </div>
      <p v-if="problems.length" class="text-xs text-error">
        Skipped {{ problems.length }} line{{ problems.length > 1 ? 's' : '' }}: {{ problems.map(p => `line ${p.line} (${p.error})`).join(', ') }}
      </p>
      <p v-if="usable.length > MAX_ACCOUNTS" class="text-xs text-warning">
        Only the first {{ MAX_ACCOUNTS }} wallets are loaded. Use the Bulk balance checker for long lists.
      </p>
    </div>

    <LoadingState v-if="loading" :label="progress" />
    <ErrorNotice :error="error" title="Could not load the portfolio" @retry="run" />
    <UAlert v-for="w in warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-info" :title="w" />

    <template v-if="portfolio">
      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-xs text-muted">
              Total value{{ accounts.length > 1 ? ` of ${accounts.length} wallets` : '' }}
            </div>
            <div v-if="showFiat" class="font-display text-3xl font-semibold text-highlighted">
              {{ formatFiat(portfolio.total, currency) }}
            </div>
            <div v-else class="mt-1 text-sm text-muted">
              {{ isTestnet ? 'Testnet coins have no market value.' : 'Price unavailable.' }}
            </div>
            <div v-if="showFiat && change !== undefined" class="mt-1 text-sm" :class="change < 0 ? 'text-error' : 'text-success'">
              {{ formatPercent(change) }} <span class="text-muted">over {{ period }}, at today's holdings</span>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UTabs v-model="period" :content="false" :items="[{ label: '24h', value: '24h' }, { label: '7d', value: '7d' }, { label: '30d', value: '30d' }]" size="xs" />
            <USelect v-if="!isTestnet" v-model="currency" :items="currencyItems" size="sm" class="w-24" aria-label="Fiat currency" />
          </div>
        </div>
        <p class="mt-3 text-xs text-dimmed">
          Prices from tonapi. Only {{ COIN_SYMBOL }}, staking and tokens verified by tonapi count toward the total.
          <template v-if="portfolio.scam">
            {{ portfolio.scam }} scam token{{ portfolio.scam > 1 ? 's were' : ' was' }} hidden.
          </template>
          {{ COIN_RENAME_NOTE }}
        </p>
      </section>

      <section>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Holdings
          </h3>
          <CsvExportButton :rows="csvRows" filename="ton-portfolio" />
        </div>
        <UTable :data="shownRows" :columns="columns" class="mt-2" :ui="{ td: 'py-2 px-2 sm:px-4', th: 'py-2 px-2 sm:px-4' }">
          <template #name-cell="{ row }">
            <div class="flex items-center gap-2 sm:min-w-36">
              <UAvatar :src="row.original.kind === 'jetton' ? row.original.image : undefined" :icon="row.original.kind === 'staked' ? 'i-lucide-layers' : row.original.kind === 'coin' ? 'i-lucide-gem' : undefined" :alt="row.original.symbol" size="sm" />
              <div class="max-w-[8.5rem] min-w-0 sm:max-w-none">
                <div class="truncate text-sm text-highlighted">
                  {{ row.original.name }}
                </div>
                <div class="text-xs text-muted">
                  {{ row.original.symbol }}<template v-if="row.original.holders > 1">
                    · in {{ row.original.holders }} wallets
                  </template>
                </div>
                <div class="truncate text-xs sm:hidden">
                  <TokenAmount :nano="row.original.units" :decimals="row.original.decimals" :symbol="''" :max-decimals="4" />
                </div>
              </div>
            </div>
          </template>
          <template #units-cell="{ row }">
            <TokenAmount :nano="row.original.units" :decimals="row.original.decimals" :symbol="''" :max-decimals="4" />
          </template>
          <template #price-cell="{ row }">
            <span class="whitespace-nowrap">{{ showFiat && row.original.rate ? formatFiat(row.original.rate.price, currency) : '—' }}</span>
          </template>
          <template #change-cell="{ row }">
            <span :class="(rowDiff(row.original) ?? 0) < 0 ? 'text-error' : (rowDiff(row.original) ?? 0) > 0 ? 'text-success' : 'text-muted'">{{ showFiat ? formatPercent(rowDiff(row.original)) : '—' }}</span>
          </template>
          <template #value-cell="{ row }">
            <div class="text-right whitespace-nowrap">
              <div>{{ showFiat && row.original.value !== undefined ? formatFiat(row.original.value, currency) : '—' }}</div>
              <div class="text-xs text-dimmed">
                {{ share(row.original) }}<span v-if="showFiat && rowDiff(row.original) !== undefined" class="ml-1 sm:hidden" :class="(rowDiff(row.original) ?? 0) < 0 ? 'text-error' : 'text-success'"> {{ formatPercent(rowDiff(row.original)) }}</span>
              </div>
            </div>
          </template>
          <template #empty>
            <span class="text-sm text-muted">No {{ COIN_SYMBOL }}, verified tokens or staking found.</span>
          </template>
        </UTable>
        <UButton
          v-if="smallCount"
          :label="showSmall ? 'Hide small balances' : `Show ${smallCount} small balance${smallCount > 1 ? 's' : ''} (under ${formatFiat(1, currency)} or no price)`"
          :icon="showSmall ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          variant="link"
          size="sm"
          class="mt-1 px-0"
          @click="showSmall = !showSmall"
        />
      </section>

      <section v-if="portfolio.unverified.length">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Unverified tokens ({{ portfolio.unverified.length }})
          </h3>
          <USwitch v-model="includeUnverified" label="Count in total" size="sm" />
        </div>
        <p class="mt-1 text-xs text-dimmed">
          Not reviewed by tonapi. Their prices can come from thin or self-made markets, and many are spam airdrops. Never connect your wallet to a site an unknown token points you to.
        </p>
        <UTable :data="portfolio.unverified" :columns="columns" class="mt-2 max-h-96" sticky :ui="{ td: 'py-2 px-2 sm:px-4', th: 'py-2 px-2 sm:px-4' }">
          <template #name-cell="{ row }">
            <div class="max-w-[10rem] min-w-0 sm:max-w-none sm:min-w-36">
              <div class="truncate text-sm text-highlighted">
                {{ row.original.name }}
              </div>
              <div class="text-xs text-muted">
                {{ row.original.symbol }}
              </div>
              <div class="truncate text-xs sm:hidden">
                <TokenAmount :nano="row.original.units" :decimals="row.original.decimals" :symbol="''" :max-decimals="4" />
              </div>
            </div>
          </template>
          <template #units-cell="{ row }">
            <TokenAmount :nano="row.original.units" :decimals="row.original.decimals" :symbol="''" :max-decimals="4" />
          </template>
          <template #price-cell="{ row }">
            <span class="whitespace-nowrap">{{ showFiat && row.original.rate ? formatFiat(row.original.rate.price, currency) : '—' }}</span>
          </template>
          <template #change-cell="{ row }">
            <span class="text-muted">{{ showFiat ? formatPercent(rowDiff(row.original)) : '—' }}</span>
          </template>
          <template #value-cell="{ row }">
            <div class="text-right whitespace-nowrap">
              {{ showFiat && row.original.value !== undefined ? formatFiat(row.original.value, currency) : '—' }}
            </div>
          </template>
        </UTable>
      </section>

      <section v-if="portfolio.perAccount.length > 1">
        <h3 class="text-sm font-semibold text-highlighted">
          By wallet
        </h3>
        <UTable :data="portfolio.perAccount" :columns="accountColumns" class="mt-2" :ui="{ td: 'py-2 px-2 sm:px-4', th: 'py-2 px-2 sm:px-4' }">
          <template #raw-cell="{ row }">
            <div class="min-w-40">
              <div v-if="row.original.label" class="text-sm text-highlighted">
                {{ row.original.label }}
              </div>
              <AddressLink :address="friendly(row.original.raw, { testnet: isTestnet })" no-links />
            </div>
          </template>
          <template v-for="k in ['coin', 'tokens', 'staked', 'total'] as const" :key="k" #[`${k}-cell`]="{ row }">
            <span class="whitespace-nowrap" :class="k === 'total' ? 'font-medium text-highlighted' : ''">{{ showFiat ? formatFiat(row.original[k], currency) : '—' }}</span>
          </template>
        </UTable>
      </section>
    </template>
  </div>
</template>
