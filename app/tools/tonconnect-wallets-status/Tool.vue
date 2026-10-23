<script setup lang="ts">
import type { WalletRow } from './logic'
import { eventsUrl, filterWallets, parseWalletList, PLATFORM_LABELS, PLATFORMS, randomClientId, toCsvRows, uniqueBridges, WALLET_LIST_URLS } from './logic'

interface BridgeState { state: 'checking' | 'ok' | 'down', ms?: number }

const rows = shallowRef<WalletRow[]>([])
const source = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const bridgeState = ref<Record<string, BridgeState>>({})
const checking = ref(false)
const checkedAt = ref<Date | null>(null)

async function loadList() {
  loading.value = true
  error.value = null
  try {
    let lastErr: unknown
    for (const url of WALLET_LIST_URLS) {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
        rows.value = parseWalletList(await res.json())
        source.value = url
        return
      }
      catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  }
  catch (e) {
    error.value = new Error(`Could not load the wallets list: ${(e as Error).message}`)
  }
  finally {
    loading.value = false
  }
}

const TIMEOUT_MS = 10_000

// One throwaway SSE subscription per bridge: OK when the stream opens (HTTP 200 text/event-stream) within TIMEOUT_MS (some bridges, Telegram's included, take 3+ s to open from a browser).
function probe(url: string): Promise<BridgeState> {
  return new Promise((resolve) => {
    const t0 = performance.now()
    let es: EventSource
    try {
      es = new EventSource(eventsUrl(url, randomClientId()))
    }
    catch {
      resolve({ state: 'down' })
      return
    }
    const done = (ok: boolean) => {
      clearTimeout(timer)
      es.close()
      resolve(ok ? { state: 'ok', ms: Math.round(performance.now() - t0) } : { state: 'down' })
    }
    const timer = setTimeout(() => done(false), TIMEOUT_MS)
    es.onopen = () => done(true)
    es.onerror = () => done(false)
  })
}

async function checkBridges() {
  if (checking.value) return
  checking.value = true
  const list = uniqueBridges(rows.value).map(b => b.url)
  bridgeState.value = Object.fromEntries(list.map(u => [u, { state: 'checking' }]))
  // ponytail: 6 at a time is polite enough for ~25 bridges; no per-bridge retry.
  const queue = [...list]
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      const r = await probe(u)
      bridgeState.value = { ...bridgeState.value, [u]: r }
    }
  }))
  checkedAt.value = new Date()
  checking.value = false
}

onMounted(async () => {
  await loadList()
  if (rows.value.length) checkBridges()
})

const filter = reactive({ q: '', platform: '', signData: false, extraCurrency: false })
const shown = computed(() => filterWallets(rows.value, filter))
const bridges = computed(() => uniqueBridges(rows.value))
const okCount = computed(() => Object.values(bridgeState.value).filter(s => s.state === 'ok').length)
const downList = computed(() => bridges.value.filter(b => bridgeState.value[b.url]?.state === 'down'))

const platformItems = [{ label: 'All platforms', value: 'all' }, ...PLATFORMS.map(p => ({ label: PLATFORM_LABELS[p], value: p }))]
const platformSel = computed({ get: () => filter.platform || 'all', set: (v: string) => (filter.platform = v === 'all' ? '' : v) })

const stats = computed(() => [
  { label: 'Wallets', value: String(rows.value.length) },
  { label: 'Bridges answering', value: checkedAt.value || checking.value ? `${okCount.value} / ${bridges.value.length}` : '—' },
  { label: 'Support signData', value: String(rows.value.filter(r => r.features.signData.length).length) },
  { label: 'Extra currencies', value: String(rows.value.filter(r => r.features.sendTransaction?.extraCurrency).length) }
])

const DOT: Record<BridgeState['state'], string> = { checking: 'bg-neutral-400 animate-pulse', ok: 'bg-success', down: 'bg-error' }
const stateLabel = (s?: BridgeState) => !s ? 'not checked' : s.state === 'ok' ? `answers · ${s.ms} ms` : s.state === 'down' ? `no answer in ${TIMEOUT_MS / 1000} s` : 'checking…'
const platformText = (r: WalletRow) => r.platforms.map(p => PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] ?? p).join(', ')
</script>

<template>
  <div class="space-y-6">
    <LoadingState v-if="loading" label="Loading the TonConnect wallets list…" />
    <ErrorNotice v-else-if="error" :error="error" />

    <template v-if="rows.length">
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="s in stats" :key="s.label" class="rounded-lg border border-default p-3">
          <dt class="text-xs text-muted">
            {{ s.label }}
          </dt>
          <dd class="mt-1 font-display text-xl font-semibold text-highlighted" :data-testid="`stat-${s.label}`">
            {{ s.value }}
          </dd>
        </div>
      </dl>

      <!-- Bridges -->
      <section class="space-y-3" aria-labelledby="bridges-h">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="bridges-h" class="font-display text-sm font-semibold text-highlighted">
            Bridges ({{ bridges.length }})
          </h3>
          <UButton :label="checking ? 'Checking…' : 'Check again'" icon="i-lucide-refresh-cw" size="sm" variant="outline" color="neutral" :loading="checking" @click="checkBridges" />
        </div>
        <p class="text-sm text-muted">
          A bridge relays encrypted messages between dApps and a wallet. If it is down, that wallet cannot connect or sign through a QR code or link. Your browser opens a test subscription to each one with a random client id; nothing is sent.
        </p>
        <UAlert
          v-if="checkedAt && downList.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="`${downList.length} bridge${downList.length > 1 ? 's' : ''} did not answer from your browser`"
          description="This can be a real outage, a Cloudflare challenge, or a block on your network. Your browser console shows a network error for each one."
        />
        <ul class="divide-y divide-default rounded-lg border border-default" data-testid="bridge-list">
          <li v-for="b in bridges" :key="b.url" class="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
            <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="DOT[bridgeState[b.url]?.state ?? 'checking']" />
            <div class="min-w-0 flex-1">
              <p class="font-mono text-xs break-all text-highlighted">
                {{ b.url.replace(/^https:\/\//, '') }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ b.wallets.join(', ') }}
              </p>
            </div>
            <span class="basis-full pl-5 text-xs sm:basis-auto sm:pl-0" :class="bridgeState[b.url]?.state === 'down' ? 'text-error' : 'text-muted'">{{ stateLabel(bridgeState[b.url]) }}</span>
          </li>
        </ul>
      </section>

      <!-- Wallets -->
      <section class="space-y-3" aria-labelledby="wallets-h">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="wallets-h" class="font-display text-sm font-semibold text-highlighted">
            Wallets ({{ shown.length }} of {{ rows.length }})
          </h3>
          <CsvExportButton :rows="toCsvRows(shown)" filename="tonconnect-wallets.csv" />
        </div>
        <div class="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <UInput v-model="filter.q" icon="i-lucide-search" placeholder="Search name, app_name, bridge…" class="w-full" data-testid="wallet-search" />
          <USelect v-model="platformSel" :items="platformItems" class="w-full" aria-label="Platform" />
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-2">
          <UCheckbox v-model="filter.signData" label="Supports signData" />
          <UCheckbox v-model="filter.extraCurrency" label="Supports extra currencies" />
        </div>

        <p v-if="!shown.length" class="rounded-lg border border-dashed border-default p-6 text-center text-sm text-muted">
          No wallet matches these filters.
        </p>
        <ul class="grid gap-3 md:grid-cols-2" data-testid="wallet-list">
          <li v-for="w in shown" :key="w.appName + w.name" class="flex flex-col gap-3 rounded-lg border border-default p-4">
            <div class="flex items-center gap-3">
              <img v-if="w.image" :src="w.image" alt="" loading="lazy" referrerpolicy="no-referrer" class="size-10 shrink-0 rounded-lg border border-default bg-elevated">
              <div class="min-w-0">
                <p class="truncate font-medium text-highlighted">
                  {{ w.name }}
                </p>
                <p class="truncate font-mono text-xs text-muted">
                  {{ w.appName }}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <UBadge v-if="w.features.sendTransaction" color="primary" variant="subtle" :label="`${w.features.sendTransaction.maxMessages} msg / request`" />
              <UBadge v-if="w.features.sendTransaction?.extraCurrency" color="primary" variant="subtle" label="Extra currencies" />
              <UBadge v-if="w.features.signData.length" color="primary" variant="subtle" :label="`signData: ${w.features.signData.join(', ')}`" />
              <UBadge v-else color="neutral" variant="subtle" label="No signData" />
              <UBadge v-if="w.features.signMessage" color="primary" variant="subtle" label="signMessage" />
              <UBadge v-if="w.features.sendTransaction?.itemTypes.length" color="primary" variant="subtle" :label="`items: ${w.features.sendTransaction.itemTypes.join(', ')}`" />
              <UBadge v-if="w.features.embeddedRequest" color="primary" variant="subtle" label="Embedded request" />
            </div>

            <dl class="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <dt class="text-muted">
                Platforms
              </dt>
              <dd class="text-default">
                {{ platformText(w) }}
              </dd>
              <template v-if="w.sseBridge">
                <dt class="text-muted">
                  Bridge
                </dt>
                <dd class="flex min-w-0 items-start gap-1.5">
                  <span class="mt-1 size-2 shrink-0 rounded-full" :class="DOT[bridgeState[w.sseBridge]?.state ?? 'checking']" :title="stateLabel(bridgeState[w.sseBridge])" />
                  <span class="font-mono break-all text-default">{{ w.sseBridge }}</span>
                </dd>
              </template>
              <template v-if="w.jsKey">
                <dt class="text-muted">
                  JS bridge
                </dt>
                <dd class="font-mono break-all text-default">
                  window.{{ w.jsKey }}.tonconnect
                </dd>
              </template>
              <template v-if="w.universalUrl">
                <dt class="text-muted">
                  Universal link
                </dt>
                <dd class="font-mono break-all text-default">
                  {{ w.universalUrl }}
                </dd>
              </template>
            </dl>

            <p v-if="w.issues.length" class="text-xs text-warning">
              List entry problems: {{ w.issues.join('; ') }}
            </p>
            <a v-if="w.aboutUrl" :href="w.aboutUrl" target="_blank" rel="noopener" class="mt-auto inline-flex items-center gap-1 text-xs text-muted hover:text-primary">
              Website <UIcon name="i-lucide-arrow-up-right" class="size-3" />
            </a>
          </li>
        </ul>
        <p class="text-xs text-dimmed">
          Source: <a :href="source" target="_blank" rel="noopener" class="underline">{{ source }}</a>, the list @tonconnect/sdk loads. It shows what each wallet app claims; a connected wallet reports its real features at runtime (see the transaction tester).
        </p>
      </section>
    </template>
  </div>
</template>
