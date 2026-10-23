<script setup lang="ts">
import type { Ref } from 'vue'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { fetchAccountStates, fetchRates, resolveName, useAccountClients } from '~/lib/accounts/api'
import type { AccountState, Rate, TonapiJettonBalance } from '~/lib/accounts/core'
import { fiatValue, formatFiat, formatPercent, formatUtc, friendly, STATUS_INFO, timeAgo } from '~/lib/accounts/core'
import { useFiatCurrency } from '~/lib/accounts/prefs'
import type { JettonSummary } from './logic'
import { classifyQuery, countLabel, JETTON_PAGE, summarizeJettons } from './logic'

const EXAMPLES = [
  { label: 'foundation.ton', value: 'foundation.ton' },
  { label: 'Binance (needs memo)', value: 'UQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xI-e' },
  { label: 'W5 wallet', value: 'UQBNptKtYdpPkOMZCVglVWaQ0PwwNHDxkYb6NvIyDcUTgcrl' },
  { label: 'USD₮ master', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' }
]
const NFT_LIMIT = 101

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const { currency, items: currencyItems } = useFiatCurrency()
const clients = useAccountClients(network)

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const query = computed(() => classifyQuery(input.value))

const loading = ref(false)
const error = ref<unknown>(null)
const state = ref<AccountState | null>(null)
const resolvedFrom = ref('')
const extrasError = ref<unknown>(null)

// Progressive extras: undefined = loading, null = failed
const rate = ref<Rate | null | undefined>()
const jettons = ref<JettonSummary | null | undefined>()
const nftCount = ref<number | null | undefined>()
const domains = ref<string[] | null | undefined>()

let runId = 0

async function lookup() {
  const q = query.value
  if (q.kind !== 'address' && q.kind !== 'domain') return
  const id = ++runId
  loading.value = true
  error.value = null
  state.value = null
  extrasError.value = null
  rate.value = jettons.value = nftCount.value = domains.value = undefined
  resolvedFrom.value = ''
  router.replace({ query: { ...route.query, q: input.value.trim() } })
  try {
    const raw = q.kind === 'domain' ? await resolveName(q.name, clients) : q.raw
    if (id !== runId) return
    if (q.kind === 'domain') resolvedFrom.value = q.name
    const res = await fetchAccountStates([raw], clients)
    if (id !== runId) return
    state.value = res.states.get(raw) ?? null
    extrasError.value = res.extrasError ?? null
    loading.value = false
    loadExtras(raw, id)
  }
  catch (e) {
    if (id === runId) {
      error.value = e
      loading.value = false
    }
  }
}

/** Fills one progressive section; ignores results from an older lookup. */
function track<T>(p: Promise<T>, r: Ref<T | null | undefined>, id: number) {
  p.then((v) => {
    if (id === runId) r.value = v
  }, () => {
    if (id === runId) r.value = null
  })
}

function loadJettons(raw: string, cur: string, id: number) {
  jettons.value = undefined
  track(clients.tonapi<{ balances: TonapiJettonBalance[] }>(`accounts/${raw}/jettons`, { currencies: cur.toLowerCase() }).then(r => summarizeJettons(r.balances, cur)), jettons, id)
}

function loadRate(cur: string, id: number) {
  rate.value = isTestnet.value ? null : undefined
  if (!isTestnet.value) track(fetchRates(cur, clients).then(r => r.ton ?? null), rate, id)
}

function loadExtras(raw: string, id: number) {
  loadRate(currency.value, id)
  loadJettons(raw, currency.value, id)
  track(clients.tonapi<{ domains: string[] }>(`accounts/${raw}/dns/backresolve`).then(r => r.domains), domains, id)
  track(clients.v3<{ nft_items: unknown[] }>('nft/items', { owner_address: raw, limit: NFT_LIMIT }).then(r => r.nft_items.length), nftCount, id)
}

// Re-price when the currency changes.
watch(currency, (cur) => {
  if (!state.value || isTestnet.value) return
  loadRate(cur, runId)
  loadJettons(state.value.raw, cur, runId)
})
watch(network, () => state.value && lookup())

onMounted(() => {
  if (query.value.kind === 'address' || query.value.kind === 'domain') lookup()
})

function tryExample(v: string) {
  input.value = v
  lookup()
}

const s = computed(() => state.value)
const status = computed(() => s.value ? STATUS_INFO[s.value.status] : null)
const fiat = computed(() => s.value && rate.value ? fiatValue(s.value.balance, COIN_DECIMALS, rate.value.price) : null)

const addressRows = computed<KeyValueItem[]>(() => {
  if (!s.value) return []
  const t = isTestnet.value
  const nb = friendly(s.value.raw, { wallet: true, testnet: t })
  const b = friendly(s.value.raw, { wallet: false, testnet: t })
  return [
    { label: 'Non-bounceable (for wallets)', value: nb, hint: s.value.isWallet ? 'Wallet apps show this form. Use it to send to this wallet.' : undefined },
    { label: 'Bounceable (for contracts)', value: b, hint: !s.value.isWallet ? 'Use this form for smart contracts: a failed transfer comes back.' : undefined },
    { label: 'Raw', value: s.value.raw }
  ]
})

const detailRows = computed<KeyValueItem[]>(() => {
  const a = s.value
  if (!a) return []
  const rows: KeyValueItem[] = [
    { label: 'Contract type', value: a.kind, mono: false, copy: false, hint: a.interfaces.length ? `Interfaces: ${a.interfaces.join(', ')}` : undefined }
  ]
  if (a.seqno !== undefined) rows.push({ label: 'Seqno', value: String(a.seqno), copy: false, hint: 'Number of outgoing transfers this wallet has sent (its replay counter).' })
  if (a.walletId !== undefined) rows.push({ label: 'Wallet ID (subwallet)', value: String(a.walletId), copy: false })
  rows.push({ label: 'Last activity', value: a.lastActivity ? `${timeAgo(a.lastActivity)} · ${formatUtc(a.lastActivity)}` : '—', mono: false, copy: false })
  if (a.lastTxLt) rows.push({ label: 'Last transaction LT', value: a.lastTxLt })
  return rows
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label="Address or name" :error="query.kind === 'invalid' ? query.error : undefined" hint="EQ…, UQ…, 0:…, foundation.ton or name.t.me">
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
          <UButton type="submit" size="lg" icon="i-lucide-search" label="Look up" :loading="loading" :disabled="query.kind !== 'address' && query.kind !== 'domain'" />
        </div>
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.value" :label="ex.label" variant="link" size="sm" class="px-0" @click="tryExample(ex.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="query.kind === 'domain' ? 'Resolving name and loading account…' : 'Loading account…'" />
    <ErrorNotice :error="error" title="Lookup failed" @retry="lookup" />

    <template v-if="s && status">
      <UAlert v-if="s.isScam" color="error" variant="subtle" icon="i-lucide-shield-alert" title="Flagged as a scam" description="tonapi marks this account as a scam or impersonator. Do not send anything to it." />
      <UAlert
        v-if="s.memoRequired"
        color="warning"
        variant="subtle"
        icon="i-lucide-message-square-warning"
        title="Memo (comment) required"
        description="This looks like an exchange or service deposit address. Always include the memo/comment the service gave you, or your funds may be lost."
      />

      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-lg font-semibold text-highlighted break-all">
                {{ s.name || resolvedFrom || 'Unnamed account' }}
              </h2>
              <UBadge :color="status.color" variant="subtle" :label="status.label" />
              <UBadge color="neutral" variant="outline" :label="s.kind" />
              <UBadge v-if="s.suspended" color="warning" variant="subtle" label="Suspended" />
            </div>
            <p v-if="resolvedFrom" class="mt-1 text-xs text-muted">
              {{ resolvedFrom }} points to this wallet.
            </p>
            <p class="mt-1 text-xs text-dimmed">
              {{ status.hint }}
            </p>
          </div>
          <ExplorerLinks :value="friendly(s.raw, { wallet: s.isWallet, testnet: isTestnet })" />
        </div>

        <div class="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div class="text-xs text-muted">
              Balance
            </div>
            <div class="text-2xl font-semibold text-highlighted">
              <TokenAmount :nano="s.balance" :max-decimals="4" />
            </div>
          </div>
          <div v-if="!isTestnet" class="pb-1">
            <div v-if="rate === undefined" class="text-sm text-muted">
              Loading price…
            </div>
            <template v-else-if="rate && fiat !== null">
              <div class="text-lg text-highlighted">
                ≈ {{ formatFiat(fiat, currency) }}
              </div>
              <div class="text-xs text-muted">
                1 {{ COIN_SYMBOL }} = {{ formatFiat(rate.price, currency) }}
                <span :class="(rate.diff24h ?? 0) < 0 ? 'text-error' : 'text-success'">{{ formatPercent(rate.diff24h) }} 24h</span>
              </div>
            </template>
            <div v-else class="text-xs text-muted">
              Price unavailable right now.
            </div>
          </div>
          <USelect v-if="!isTestnet" v-model="currency" :items="currencyItems" size="sm" class="ml-auto w-24" aria-label="Fiat currency" />
        </div>
        <p class="mt-2 text-xs text-dimmed">
          {{ COIN_RENAME_NOTE }} Exact balance: <TokenAmount :nano="s.balance" :symbol="COIN_SYMBOL" />.
          <template v-if="isTestnet">
            Testnet coins have no market value.
          </template>
        </p>
      </section>

      <div class="grid gap-6 md:grid-cols-2">
        <section>
          <h3 class="text-sm font-semibold text-highlighted">
            Address
          </h3>
          <KeyValue :items="addressRows" />
        </section>
        <section>
          <h3 class="text-sm font-semibold text-highlighted">
            Details
          </h3>
          <KeyValue :items="detailRows" />
          <ResultField v-if="s.lastTxHash" label="Last transaction" :value="s.lastTxHash" :copy="false">
            <ExplorerLinks kind="tx" :value="s.lastTxHash" />
          </ResultField>
          <ResultField label="Linked .ton / .t.me names" value="" :mono="false" :copy="false" hint="Names this account owns that also point back to it (reverse lookup). A name someone else owns can point here without showing up.">
            <span v-if="domains === undefined" class="text-muted">Loading…</span>
            <span v-else-if="domains === null" class="text-muted">Unavailable</span>
            <span v-else-if="!domains.length" class="text-muted">None</span>
            <span v-else class="flex flex-wrap gap-1.5"><UBadge v-for="d in domains" :key="d" color="neutral" variant="subtle" :label="d" /></span>
          </ResultField>
        </section>
      </div>

      <section>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            Tokens and NFTs
          </h3>
          <UButton :to="`/tools/portfolio?address=${encodeURIComponent(s.raw)}`" label="Full portfolio" icon="i-lucide-chart-pie" variant="link" size="sm" class="px-0" />
        </div>
        <div class="mt-2 grid gap-3 sm:grid-cols-2">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              Jettons held
            </div>
            <div v-if="jettons === undefined" class="mt-1 text-sm text-muted">
              Loading…
            </div>
            <div v-else-if="jettons === null" class="mt-1 text-sm text-muted">
              Unavailable
            </div>
            <template v-else>
              <div class="mt-1 text-lg font-semibold text-highlighted">
                {{ jettons.count }}{{ jettons.capped ? '+' : '' }}
                <span v-if="!isTestnet && jettons.value > 0" class="text-sm font-normal text-muted">≈ {{ formatFiat(jettons.value, currency) }} <span class="text-xs">(verified tokens)</span></span>
              </div>
              <div v-if="jettons.scam" class="text-xs text-warning">
                + {{ jettons.scam }} scam token{{ jettons.scam > 1 ? 's' : '' }} hidden (airdropped spam, ignore it)
              </div>
              <div v-if="jettons.capped" class="text-xs text-dimmed">
                tonapi lists only the first {{ JETTON_PAGE.toLocaleString('en-US') }} token balances, so some are missing here.
              </div>
            </template>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">
              NFTs held
            </div>
            <div class="mt-1 text-lg font-semibold text-highlighted">
              <span v-if="nftCount === undefined" class="text-sm font-normal text-muted">Loading…</span>
              <span v-else-if="nftCount === null" class="text-sm font-normal text-muted">Unavailable</span>
              <template v-else>
                {{ countLabel(nftCount, NFT_LIMIT) }}
              </template>
            </div>
            <div class="text-xs text-dimmed">
              Includes unsolicited spam NFTs.
            </div>
          </div>
        </div>
        <ul v-if="jettons && jettons.top.length" class="mt-3 divide-y divide-default rounded-lg border border-default">
          <li v-for="h in jettons.top" :key="h.master" class="flex items-center gap-3 px-3 py-2">
            <UAvatar :src="h.image" :alt="h.symbol" size="sm" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 text-sm text-highlighted">
                <span class="truncate">{{ h.name }}</span>
                <UIcon v-if="h.verification === 'whitelist'" name="i-lucide-badge-check" class="size-4 shrink-0 text-primary" aria-label="Verified by tonapi" />
                <UBadge v-else color="warning" variant="subtle" size="sm" label="Unverified" />
              </div>
              <TokenAmount :nano="h.units" :decimals="h.decimals" :symbol="h.symbol" :max-decimals="4" class="text-xs" />
            </div>
            <div v-if="!isTestnet" class="text-right text-sm">
              {{ h.value !== undefined ? formatFiat(h.value, currency) : '—' }}
            </div>
          </li>
        </ul>
      </section>

      <ErrorNotice v-if="extrasError" :error="extrasError" title="Name, scam flag and last activity unavailable" @retry="lookup" />
    </template>
  </div>
</template>
