<script setup lang="ts">
import { splitConfig } from '~/lib/network/config'
import type { Health, Highlight } from './logic'
import { ago, avgInterval, health, highlights } from './logic'

const { network } = useTonNetwork()
// Same ref as the watcher below: separate useCookie refs can lag each other after a switch.
const tc = useToncenter(network)
const api = useTonapi(network)

interface Probe {
  id: string
  name: string
  detail: string
  seqno?: number
  /** Unix time of the newest block it serves (not every API reports it). */
  utime?: number
  ms?: number
  note?: string
  error?: unknown
}

// Pure fetch time from Resource Timing (the shared client queues requests, so wall time includes waiting).
function fetchMs(url: string, fallback: number) {
  const e = performance.getEntriesByName(url).at(-1)
  return e ? Math.round(e.duration) : Math.round(fallback)
}

async function probe<T>(p: Omit<Probe, 'seqno' | 'utime' | 'ms'>, url: string, run: () => Promise<T>, read: (r: T) => Partial<Probe>): Promise<Probe> {
  const t0 = performance.now()
  try {
    const r = await run()
    return { ...p, ...read(r), ms: fetchMs(url, performance.now() - t0) }
  }
  catch (error) {
    return { ...p, error }
  }
}

const probes = ref<Probe[]>([])
const blockTime = ref<number | null>(null)
const shards = ref<number | null>(null)
const loading = ref(false)
const checkedAt = ref(0)
const now = ref(Math.floor(Date.now() / 1000))

// Bumped on every network switch; results of an older generation are dropped.
let gen = 0
async function refresh(networkChanged = false) {
  if (loading.value && !networkChanged) return
  const g = networkChanged ? ++gen : gen
  loading.value = true
  // The dev bundle alone can fill the 250-entry Resource Timing buffer; start clean so our entries are recorded.
  performance.clearResourceTimings()
  const tcBase = tc.baseUrl()
  const apiBase = api.baseUrl()
  const [v2, v3, head, status] = await Promise.all([
    probe({ id: 'tc2', name: 'toncenter API v2', detail: 'Liteserver gateway: balances, get-methods, sending' }, `${tcBase}/v2/getMasterchainInfo`,
      () => tc.v2<{ last: { seqno: number } }>('getMasterchainInfo'), r => ({ seqno: r.last.seqno })),
    probe({ id: 'tc3', name: 'toncenter API v3', detail: 'Indexer: transactions, traces, jettons, NFTs' }, `${tcBase}/v3/masterchainInfo`,
      () => tc.v3<{ last: { seqno: number, gen_utime: string } }>('masterchainInfo'), r => ({ seqno: r.last.seqno, utime: Number(r.last.gen_utime) })),
    probe({ id: 'tonapi', name: 'tonapi', detail: 'Indexer used by Tonkeeper and many apps' }, `${apiBase}/blockchain/masterchain-head`,
      () => api.get<{ seqno: number, gen_utime: number }>('blockchain/masterchain-head'), r => ({ seqno: r.seqno, utime: r.gen_utime })),
    api.get<{ rest_online: boolean, indexing_latency: number }>('status').catch(() => null)
  ])
  if (g !== gen) return
  if (status) head.note = `${status.rest_online ? 'REST online' : 'REST offline'}, indexing latency ${status.indexing_latency} s`
  probes.value = [v2, v3, head]
  checkedAt.value = Math.floor(Date.now() / 1000)
  now.value = checkedAt.value
  loading.value = false

  // Secondary numbers: block time from the last 20 masterchain blocks, shard count at the newest block.
  try {
    const { blocks } = await tc.v3<{ blocks: { gen_utime: string }[] }>('blocks', { workchain: -1, limit: 20, sort: 'desc' })
    if (g === gen) blockTime.value = avgInterval(blocks.map(b => Number(b.gen_utime)))
  }
  catch { if (g === gen) blockTime.value = null }
  const at = v3.seqno ?? v2.seqno
  if (at) {
    try {
      const r = await tc.v2<{ shards: { workchain: number }[] }>('shards', { seqno: at })
      if (g === gen) shards.value = r.shards.filter(s => s.workchain === 0).length
    }
    catch { if (g === gen) shards.value = null }
  }
}

// Config highlights: one getConfigAll per network.
const config = shallowRef<Highlight[]>([])
const configError = ref<unknown>(null)
const configLoading = ref(false)
async function loadConfig() {
  const g = gen
  configLoading.value = true
  configError.value = null
  try {
    const r = await tc.v2<{ config: { bytes: string } }>('getConfigAll')
    if (g === gen) config.value = highlights(splitConfig(r.config.bytes))
  }
  catch (e) {
    if (g === gen) configError.value = e
  }
  finally {
    if (g === gen) configLoading.value = false
  }
}

const auto = ref(true)
let timer: ReturnType<typeof setInterval> | undefined
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 1000)
  timer = setInterval(() => {
    if (auto.value && document.visibilityState === 'visible') refresh()
  }, 30_000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  clearInterval(clock)
})
watch(network, () => {
  probes.value = []
  blockTime.value = null
  shards.value = null
  config.value = []
  // Both run at once; the shared client queues them per host anyway.
  refresh(true)
  loadConfig()
}, { immediate: true })

const rows = computed(() => probes.value.map((p) => {
  const age = p.utime ? Math.max(0, checkedAt.value - p.utime) : null
  return { ...p, age, state: health(age, !!p.error, p.error instanceof TonApiError && p.error.isRateLimit) }
}))
const best = computed(() => Math.max(0, ...rows.value.map(r => r.seqno ?? 0)))
const freshest = computed(() => rows.value.filter(r => r.utime).sort((a, b) => b.utime! - a.utime!)[0])
const overall = computed<Health | null>(() => {
  if (!rows.value.length) return null
  if (rows.value.every(r => r.state === 'down')) return 'down'
  if (rows.value.some(r => r.state === 'down' || r.state === 'lagging')) return 'lagging'
  return rows.value.some(r => r.state === 'limited') ? 'limited' : 'ok'
})
const STATE = {
  ok: { label: 'In sync', color: 'success', icon: 'i-lucide-circle-check' },
  lagging: { label: 'Lagging', color: 'warning', icon: 'i-lucide-clock-alert' },
  down: { label: 'Not responding', color: 'error', icon: 'i-lucide-circle-x' },
  limited: { label: 'Rate limited', color: 'neutral', icon: 'i-lucide-hourglass' }
} as const
const banner = computed(() => {
  if (!overall.value) return null
  if (overall.value === 'ok') return { color: 'success' as const, icon: 'i-lucide-circle-check', title: 'The network and public APIs look healthy', text: 'New blocks are arriving and every API serves fresh data.' }
  if (overall.value === 'limited') return { color: 'neutral' as const, icon: 'i-lucide-hourglass', title: 'Some checks were rate limited', text: 'The keyless APIs allow about one request per second per IP address, and this browser (or your network) went over it. The APIs themselves are up; refresh in a few seconds.' }
  const bad = rows.value.filter(r => r.state === 'down' || r.state === 'lagging').map(r => r.name).join(', ')
  if (overall.value === 'down') return { color: 'error' as const, icon: 'i-lucide-circle-x', title: 'Public APIs are not responding', text: 'Your connection may be down, or the APIs are rate limiting you. Try again in a few seconds.' }
  return { color: 'warning' as const, icon: 'i-lucide-clock-alert', title: `Problem with ${bad}`, text: 'Tools that use this API may show stale data or fail. The chain itself can still be fine.' }
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 text-sm text-muted">
        <UBadge :label="network === 'mainnet' ? 'Mainnet' : 'Testnet'" :color="network === 'mainnet' ? 'primary' : 'warning'" variant="subtle" />
        <span v-if="checkedAt">Checked {{ ago(now - checkedAt) }}</span>
      </div>
      <div class="flex items-center gap-3">
        <USwitch v-model="auto" label="Auto-refresh (30 s)" />
        <UButton icon="i-lucide-refresh-cw" label="Refresh" size="sm" color="neutral" variant="outline" :loading="loading" @click="refresh()" />
      </div>
    </div>

    <LoadingState v-if="!rows.length" label="Checking toncenter and tonapi…" />

    <template v-else>
      <UAlert v-if="banner" :color="banner.color" variant="subtle" :icon="banner.icon" :title="banner.title" :description="banner.text" data-testid="status-banner" />

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="col-span-2 rounded-lg border border-default p-4 lg:col-span-1">
          <div class="text-xs text-muted">
            Latest masterchain block
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg" data-testid="best-seqno">
            {{ best ? best.toLocaleString('en-US') : '—' }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            {{ freshest?.utime ? `created ${ago(now - freshest.utime)}` : '' }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Block time
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            {{ blockTime !== null ? `${blockTime.toFixed(2)} s` : '…' }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            average of the last 20 masterchain blocks
          </div>
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Basechain shards
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            {{ shards ?? '…' }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            the chain splits into more shards under load
          </div>
        </div>
        <div class="col-span-2 rounded-lg border border-default p-4 lg:col-span-1">
          <div class="text-xs text-muted">
            APIs in sync
          </div>
          <div class="mt-1 font-display text-base break-words text-highlighted tabular-nums sm:text-lg">
            {{ rows.filter(r => r.state === 'ok').length }} / {{ rows.length }}
          </div>
          <div class="mt-0.5 text-xs text-dimmed">
            toncenter v2, v3 and tonapi
          </div>
        </div>
      </div>

      <section aria-labelledby="apis-h" class="space-y-3">
        <h3 id="apis-h" class="font-display text-base font-semibold text-highlighted">
          Public APIs
        </h3>
        <div class="divide-y divide-default rounded-lg border border-default">
          <div v-for="r in rows" :key="r.id" class="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" :data-testid="`probe-${r.id}`">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-highlighted">{{ r.name }}</span>
                <UBadge :label="STATE[r.state].label" :color="STATE[r.state].color" :icon="STATE[r.state].icon" variant="subtle" size="sm" />
              </div>
              <p class="mt-0.5 text-xs text-muted">
                {{ r.detail }}
              </p>
              <p v-if="r.note" class="mt-0.5 text-xs text-dimmed">
                {{ r.note }}
              </p>
              <p v-if="r.error" class="mt-0.5 text-xs text-error">
                {{ (r.error as Error).message }}
              </p>
            </div>
            <dl class="grid shrink-0 grid-cols-3 gap-4 text-right text-xs sm:w-80">
              <div>
                <dt class="text-muted">
                  Block
                </dt>
                <dd class="font-mono text-highlighted tabular-nums">
                  {{ r.seqno ?? '—' }}
                </dd>
                <dd v-if="r.seqno && best - r.seqno > 0" class="text-dimmed">
                  −{{ best - r.seqno }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Block age
                </dt>
                <dd class="font-mono text-highlighted tabular-nums">
                  {{ r.age !== null ? `${r.age} s` : '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Response
                </dt>
                <dd class="font-mono text-highlighted tabular-nums">
                  {{ r.ms !== undefined ? `${r.ms} ms` : '—' }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <p class="text-xs text-dimmed">
          Your browser asks each API directly. Small block differences are normal: the APIs answer a second or two apart and a new block arrives about every half second.
          "Lagging" means the newest block an API serves is older than 30 seconds. The keyless APIs allow about one request per second, so a busy page can briefly see rate limits.
        </p>
      </section>

      <section aria-labelledby="cfg-h" class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 id="cfg-h" class="font-display text-base font-semibold text-highlighted">
            Fees and limits in force
          </h3>
          <UButton to="/tools/config-params-viewer" label="All config params" trailing-icon="i-lucide-arrow-right" size="sm" variant="link" />
        </div>
        <LoadingState v-if="configLoading || (!config.length && !configError)" label="Reading the blockchain config…" />
        <ErrorNotice v-else-if="configError" :error="configError" title="Could not read the config" @retry="loadConfig" />
        <div v-else class="grid gap-x-6 rounded-lg border border-default px-4 sm:grid-cols-2">
          <ResultField v-for="h in config" :key="h.label" :label="h.label" :value="h.value" :hint="h.hint" :mono="false" :copy="false" />
        </div>
        <p class="text-xs text-dimmed">
          Fees are in {{ COIN_SYMBOL }} (formerly {{ COIN_FORMER }}); 1 {{ COIN_SYMBOL }} = 10⁹ nano ({{ NANO_NAME }}, formerly {{ NANO_FORMER }}).
        </p>
      </section>
    </template>
  </div>
</template>
