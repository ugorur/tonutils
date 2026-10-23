<script setup lang="ts">
import { fetchRates, useAccountClients } from '~/lib/accounts/api'
import { formatFiat, friendly } from '~/lib/accounts/core'
import { compactNumber, KNOWN_ACCOUNTS_SOURCE, loadKnownAccounts } from '~/lib/defi-analytics/shared'
import { USDT_MASTER } from '~/utils/ton/jetton'
import type { ToncenterActions, ToncenterJettonTransfers, Transfer } from './logic'
import { domainsFrom, fromJettonTransfers, fromTonActions, isWhale, labelOf, maxLt, mergeFeed, summarize, USDT_DECIMALS } from './logic'

const POLL_MS = 5000
const FIRST_LIMIT = 1000
const NEXT_LIMIT = 500
// Everything above these floors is kept, so lowering the threshold shows older transfers at once.
const FLOOR_COIN = 100n * 10n ** 9n
const FLOOR_USDT = 100n * 10n ** BigInt(USDT_DECIMALS)
const KEEP = 2000
const SHOW = 200

const { network, isTestnet } = useTonNetwork()
const clients = useAccountClients(network)

const minCoinText = ref('10000')
const minUsdtText = ref('10000')
const showCoin = ref(true)
const showUsdt = ref(true)
const includeMasterchain = ref(false)

function parseMin(text: string, decimals: number): bigint | null {
  try {
    return parseUnits(text.trim() || '0', decimals)
  }
  catch {
    return null
  }
}
const minCoin = computed(() => parseMin(minCoinText.value, COIN_DECIMALS))
const minUsdt = computed(() => parseMin(minUsdtText.value, USDT_DECIMALS))
const usdtAvailable = computed(() => !isTestnet.value)

const all = ref<Transfer[]>([])
const known = ref(new Map<string, string>())
const domains = new Map<string, string>()
const price = ref<number | null>(null)
const running = ref(false)
const loadingFirst = ref(false)
const error = ref<unknown>(null)
const lastUpdate = ref<number | null>(null)
/** Oldest transfer in the first batch per asset: the feed is complete from there on. */
const coverage = ref<{ coin: number | null, usdt: number | null }>({ coin: null, usdt: null })
let cursors: { coin: bigint, usdt: bigint } | null = null
let loopId = 0
let failures = 0

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

async function poll(first: boolean, id: number) {
  const lim = first ? FIRST_LIMIT : NEXT_LIMIT
  const after = (lt: bigint | undefined) => (lt === undefined ? undefined : String(lt + 1n))
  const full = { coin: false, usdt: false }
  const jobs: Promise<Transfer[]>[] = [
    clients.v3<ToncenterActions>('actions', { action_type: 'ton_transfer', sort: 'desc', limit: lim, start_lt: after(cursors?.coin) }).then((r) => {
      for (const [k, v] of domainsFrom(r.address_book)) domains.set(k, v)
      full.coin = r.actions.length >= lim
      return fromTonActions(r)
    })
  ]
  if (usdtAvailable.value) {
    jobs.push(clients.v3<ToncenterJettonTransfers>('jetton/transfers', { jetton_master: USDT_MASTER, sort: 'desc', limit: lim, start_lt: after(cursors?.usdt) }).then((r) => {
      for (const [k, v] of domainsFrom(r.address_book)) domains.set(k, v)
      full.usdt = r.jetton_transfers.length >= lim
      return fromJettonTransfers(r)
    }))
  }
  const [coin, usdt = []] = await Promise.all(jobs)
  // Paused, reset or switched network while this request was in flight: drop the answer.
  if (id !== loopId) return
  const oldest = (l: Transfer[]) => (l.length ? Math.min(...l.map(t => t.time)) : null)
  if (first) {
    coverage.value = { coin: oldest(coin!), usdt: usdtAvailable.value ? oldest(usdt) : null }
  }
  else {
    // A full page after a pause (hidden tab, outage) may have skipped transfers: the feed is complete only from its oldest item.
    if (full.coin) coverage.value.coin = oldest(coin!)
    if (full.usdt) coverage.value.usdt = oldest(usdt)
  }
  cursors = { coin: maxLt(coin!, cursors?.coin ?? 0n), usdt: maxLt(usdt, cursors?.usdt ?? 0n) }
  const keep = [...coin!, ...usdt].filter(t => t.amount >= (t.asset === 'coin' ? FLOOR_COIN : FLOOR_USDT))
  all.value = mergeFeed(all.value, keep, KEEP)
  lastUpdate.value = Date.now()
}

async function start() {
  if (running.value) return
  const id = ++loopId
  running.value = true
  error.value = null
  failures = 0
  if (!cursors) {
    loadingFirst.value = true
    if (!isTestnet.value) {
      loadKnownAccounts().then((m) => {
        if (id === loopId) known.value = m
      })
      fetchRates('USD', clients).then((r) => {
        if (id === loopId) price.value = r.ton?.price ?? null
      }, () => {})
    }
  }
  while (running.value && id === loopId) {
    if (document.visibilityState === 'visible' || !cursors) {
      try {
        await poll(!cursors, id)
        failures = 0
        error.value = null
      }
      catch (e) {
        if (id !== loopId) return
        error.value = e
        // Keep trying through short outages; stop after a minute of failures so we never hammer the API.
        if (++failures >= 6) running.value = false
      }
      if (id === loopId) loadingFirst.value = false
    }
    await wait(POLL_MS)
  }
}

function stop() {
  running.value = false
  loadingFirst.value = false
  loopId++
}

function reset() {
  stop()
  all.value = []
  cursors = null
  domains.clear()
  lastUpdate.value = null
  coverage.value = { coin: null, usdt: null }
  start()
}

onMounted(start)
onBeforeUnmount(stop)
watch(network, reset)

const filter = computed(() => ({
  minCoin: showCoin.value ? minCoin.value : null,
  minUsdt: showUsdt.value && usdtAvailable.value ? minUsdt.value : null,
  includeMasterchain: includeMasterchain.value
}))
const matches = computed(() => all.value.filter(t => isWhale(t, filter.value)))
const shown = computed(() => matches.value.slice(0, SHOW))
const totals = computed(() => summarize(matches.value))
const sinceText = computed(() => [
  filter.value.minCoin !== null && coverage.value.coin ? `${COIN_SYMBOL} since ${clock(coverage.value.coin)}` : '',
  filter.value.minUsdt !== null && coverage.value.usdt ? `USD₮ since ${clock(coverage.value.usdt)}` : ''
].filter(Boolean).join(', '))

const label = (raw: string) => labelOf(raw, known.value, domains)
const addr = (raw: string) => friendly(raw, { wallet: false, testnet: isTestnet.value })
const clock = (unix: number) => new Date(unix * 1000).toLocaleTimeString('en-GB')
function usdValue(t: Transfer): string {
  if (t.asset === 'usdt') return formatFiat(Number(t.amount) / 1e6, 'USD')
  return price.value ? `≈ ${formatFiat((Number(t.amount) / 1e9) * price.value, 'USD')}` : ''
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2">
      <div class="space-y-2 rounded-lg border border-default p-3">
        <USwitch v-model="showCoin" :label="`${COIN_SYMBOL} transfers`" />
        <UFormField :label="`Minimum (${COIN_SYMBOL})`" :error="minCoin === null ? 'Enter a number' : undefined" help="Transfers under 100 are not tracked.">
          <UInput v-model="minCoinText" inputmode="decimal" class="w-full" :disabled="!showCoin" />
        </UFormField>
        <div class="flex flex-wrap gap-1">
          <UButton v-for="v in ['1000', '10000', '100000', '1000000']" :key="v" :label="compactNumber(Number(v))" size="xs" variant="soft" :disabled="!showCoin" @click="minCoinText = v" />
        </div>
      </div>
      <div class="space-y-2 rounded-lg border border-default p-3">
        <USwitch v-model="showUsdt" label="USD₮ transfers" :disabled="!usdtAvailable" />
        <UFormField label="Minimum (USD₮)" :error="minUsdt === null ? 'Enter a number' : undefined" :help="usdtAvailable ? 'Transfers under 100 are not tracked.' : 'USD₮ exists on mainnet only.'">
          <UInput v-model="minUsdtText" inputmode="decimal" class="w-full" :disabled="!showUsdt || !usdtAvailable" />
        </UFormField>
        <div class="flex flex-wrap gap-1">
          <UButton v-for="v in ['1000', '10000', '100000', '1000000']" :key="v" :label="compactNumber(Number(v))" size="xs" variant="soft" :disabled="!showUsdt || !usdtAvailable" @click="minUsdtText = v" />
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <USwitch v-model="includeMasterchain" label="Include validator and system transfers" size="sm" />
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1.5 text-xs text-muted" role="status">
          <span class="size-2 rounded-full" :class="running ? 'animate-pulse bg-success' : 'bg-neutral-400'" />
          {{ running ? 'Live' : 'Paused' }}<template v-if="lastUpdate">
            · updated {{ new Date(lastUpdate).toLocaleTimeString('en-GB') }}
          </template>
        </span>
        <UButton v-if="running" label="Pause" icon="i-lucide-pause" size="sm" variant="soft" @click="stop" />
        <UButton v-else label="Resume" icon="i-lucide-play" size="sm" @click="start" />
      </div>
    </div>

    <ErrorNotice :error="error" title="Could not refresh the feed" @retry="start" />
    <LoadingState v-if="loadingFirst" label="Loading the latest transfers…" />

    <section v-if="!loadingFirst || all.length" class="space-y-3">
      <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
        <span>
          {{ totals.count }} transfer{{ totals.count === 1 ? '' : 's' }}<template v-if="sinceText">
            (watching {{ sinceText }})
          </template>
          <template v-if="totals.coin">
            · {{ formatAmount(totals.coin, COIN_DECIMALS, { maxDecimals: 0 }) }} {{ COIN_SYMBOL }}
          </template>
          <template v-if="totals.usdt">
            · {{ formatAmount(totals.usdt, USDT_DECIMALS, { maxDecimals: 0 }) }} USD₮
          </template>
        </span>
        <span v-if="matches.length > SHOW">showing the latest {{ SHOW }}</span>
      </div>

      <ul v-if="shown.length" class="divide-y divide-default rounded-lg border border-default">
        <li v-for="t in shown" :key="`${t.asset}:${t.id}`" class="space-y-1.5 p-3">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div class="flex items-baseline gap-2">
              <UBadge :label="t.asset === 'coin' ? COIN_SYMBOL : 'USD₮'" :color="t.asset === 'coin' ? 'primary' : 'success'" variant="subtle" size="sm" />
              <TokenAmount :nano="t.amount" :decimals="t.asset === 'coin' ? COIN_DECIMALS : USDT_DECIMALS" :symbol="''" :max-decimals="0" class="text-base font-semibold text-highlighted" />
              <span class="text-xs text-muted">{{ usdValue(t) }}</span>
            </div>
            <span class="font-mono text-xs text-muted" :title="new Date(t.time * 1000).toISOString()">{{ clock(t.time) }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span class="inline-flex min-w-0 items-center gap-1">
              <span v-if="label(t.from)" class="truncate font-medium text-highlighted">{{ label(t.from) }}</span>
              <AddressLink :address="addr(t.from)" no-links />
            </span>
            <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0 text-muted" />
            <span class="inline-flex min-w-0 items-center gap-1">
              <span v-if="label(t.to)" class="truncate font-medium text-highlighted">{{ label(t.to) }}</span>
              <AddressLink :address="addr(t.to)" no-links />
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span v-if="t.comment" class="max-w-full truncate text-xs text-muted" :title="t.comment">“{{ t.comment }}”</span>
            <ExplorerLinks v-if="t.tx" :value="t.tx" kind="tx" />
          </div>
        </li>
      </ul>
      <div v-else class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
        No transfers above your thresholds yet. The feed keeps listening{{ running ? '' : ' once you resume' }}; lower the minimum to see more.
      </div>
    </section>

    <p class="text-xs text-dimmed">
      Polls the public toncenter indexer every {{ POLL_MS / 1000 }} seconds while this tab is visible, starting from the latest {{ FIRST_LIMIT }} transfers of each kind. Failed transfers are skipped. USD₮ rows show the sender and receiver wallets, not their jetton wallets. Labels come from <a :href="KNOWN_ACCOUNTS_SOURCE" target="_blank" rel="noopener" class="underline hover:text-primary">tonkeeper/ton-assets</a> and .ton domains; a label is a public claim, not proof. Exchange-to-exchange moves are often internal reshuffles. {{ COIN_RENAME_NOTE }}
    </p>
  </div>
</template>
