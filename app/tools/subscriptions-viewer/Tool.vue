<script setup lang="ts">
import type { Address } from '@ton/core'
import type { PullerRow, TonapiSubscription, WalletPlugins } from './logic'
import { formatPeriod, formatPrice, mergeSubscriptions, readPlugins, riskSummary } from './logic'

const EXAMPLES = [
  { label: 'v4 wallet with a subscription', value: 'UQAt_V50zZzQW7hjFtqaj20ZPnN7fp4F5X_cKQWxkt_DMBS4' },
  { label: 'W5 wallet run by an extension', value: 'UQCxO74ltwmfB68XAWK7i39bdeSet35HU3GfO9BHNA4adeDI' }
]

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()
const tonapi = useTonapi()

const input = ref('')
const parsed = shallowRef<Address | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<{ address: string, status: string, plugins: WalletPlugins, rows: PullerRow[] } | null>(null)

async function run() {
  const a = parsed.value
  if (!a) return
  error.value = null
  result.value = null
  loading.value = true
  try {
    const raw = a.toRawString()
    // Different hosts, separate queues: fetch both at once.
    const [acc, subs] = await Promise.all([
      tc.v3<{ code: string | null, data: string | null, status: string }>('account', { address: raw }),
      tonapi.get<{ subscriptions: TonapiSubscription[] }>(`accounts/${raw}/subscriptions`)
    ])
    const plugins: WalletPlugins = acc.code
      ? readPlugins(acc.code, acc.data, a.workChain)
      : { version: null, label: 'Not deployed', kind: 'none', addresses: [] }
    result.value = { address: a.toString({ bounceable: false, testOnly: isTestnet.value }), status: acc.status, plugins, rows: mergeSubscriptions(plugins, subs.subscriptions ?? []) }
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
  nextTick(run)
}
watch(network, () => result.value && run())

const installed = computed(() => result.value?.rows.filter(r => r.installed) ?? [])
const past = computed(() => result.value?.rows.filter(r => !r.installed) ?? [])
const summary = computed(() => (result.value ? riskSummary(result.value.plugins, result.value.rows) : null))
const COLORS = { danger: 'error', warn: 'warning', ok: 'success' } as const
const ICONS = { danger: 'i-lucide-octagon-alert', warn: 'i-lucide-triangle-alert', ok: 'i-lucide-shield-check' } as const
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'neutral' | 'error'> = { active: 'success', suspended: 'warning', not_ready: 'neutral', cancelled: 'neutral' }
const noun = computed(() => (result.value?.plugins.kind === 'extensions' ? 'Extension' : 'Plugin'))
const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start">
        <AddressInput v-model="input" label="Wallet address" class="flex-1" @parsed="parsed = $event" />
        <UButton type="submit" label="Check" icon="i-lucide-search" size="lg" :loading="loading" :disabled="!parsed" class="justify-center sm:mt-6" />
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Reading the wallet and its subscriptions…" />
    <ErrorNotice :error="error" @retry="run" />

    <template v-if="result && summary && !loading">
      <div class="space-y-1">
        <AddressLink :address="result.address" :bounceable="false" full />
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span>Wallet: <span class="text-highlighted">{{ result.plugins.label }}</span></span>
          <span>Status: <span class="text-highlighted">{{ result.status }}</span></span>
        </div>
      </div>

      <UAlert :color="COLORS[summary.risk]" variant="subtle" :icon="ICONS[summary.risk]" :title="summary.title" :description="summary.text" data-testid="verdict" />

      <section v-if="installed.length" class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Can pull funds now ({{ installed.length }})
        </h3>
        <ul class="space-y-3">
          <li v-for="r in installed" :key="r.address" class="space-y-3 rounded-lg border border-default p-4" data-testid="puller">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="r.sub ? 'primary' : 'warning'" variant="subtle" :icon="r.sub ? 'i-lucide-repeat' : 'i-lucide-triangle-alert'" :label="r.sub ? `Subscription (${r.sub.type})` : `Unknown ${noun.toLowerCase()}`" />
              <UBadge v-if="r.sub" :color="STATUS_COLOR[r.sub.status] ?? 'neutral'" variant="subtle" :label="r.sub.status" />
            </div>
            <div v-if="r.sub" class="grid gap-3 sm:grid-cols-3">
              <div>
                <div class="text-xs text-muted">
                  Charges
                </div>
                <div class="text-base font-medium text-highlighted">
                  {{ formatPrice(r.sub.payment_per_period) }}
                </div>
                <div class="text-sm text-muted">
                  {{ formatPeriod(r.sub.period) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted">
                  Next charge
                </div>
                <div class="text-sm text-highlighted">
                  {{ r.sub.next_charge_at ? fmtDate(r.sub.next_charge_at) : '—' }}
                </div>
              </div>
              <div v-if="r.sub.beneficiary" class="min-w-0">
                <div class="text-xs text-muted">
                  Paid to
                </div>
                <div v-if="r.sub.beneficiary.name" class="text-sm text-highlighted">
                  {{ r.sub.beneficiary.name }}
                </div>
                <AddressLink :address="r.sub.beneficiary.address" :bounceable="false" no-links />
              </div>
            </div>
            <p v-else class="text-sm text-muted">
              tonapi knows no subscription for this contract. It may be a legitimate app (delegated trading, gasless relayer) or a drainer. If you did not add it yourself, move your funds to a new wallet.
            </p>
            <div>
              <div class="text-xs text-muted">
                {{ noun }} contract
              </div>
              <AddressLink :address="r.address" />
            </div>
          </li>
        </ul>
      </section>

      <details v-if="past.length" class="group rounded-md border border-default">
        <summary class="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-highlighted">
          Past subscriptions ({{ past.length }})
          <UIcon name="i-lucide-chevron-down" class="size-4 transition group-open:rotate-180" />
        </summary>
        <ul class="divide-y divide-default border-t border-default">
          <li v-for="r in past" :key="r.sub!.subscription_id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span class="text-highlighted">{{ r.sub!.beneficiary?.name ?? 'Subscription' }} · {{ formatPrice(r.sub!.payment_per_period) }} {{ formatPeriod(r.sub!.period) }}</span>
            <UBadge :color="STATUS_COLOR[r.sub!.status] ?? 'neutral'" variant="subtle" :label="r.sub!.status" />
          </li>
        </ul>
        <p class="border-t border-default px-4 py-3 text-xs text-muted">
          No longer installed in the wallet, so they cannot charge it.
        </p>
      </details>

      <UAlert
        v-if="installed.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="How to cancel"
        description="Cancel a subscription in the app where you started it (Tonkeeper Pro: in Tonkeeper's settings). Removing a plugin or extension needs a special message signed by your wallet key, which websites cannot request through TonConnect, so this page cannot remove it for you. If you do not trust an unknown extension, move your funds to a new wallet."
      />
      <UButton
        v-if="installed.length && result.plugins.kind === 'extensions'"
        to="/tools/wallet-v5-actions-builder"
        label="Advanced: build a remove-extension request"
        variant="link"
        size="sm"
        class="max-w-full px-0"
        trailing-icon="i-lucide-arrow-right"
      />
    </template>

    <p class="text-xs text-muted">
      The plugin and extension list is read from the wallet's own data on toncenter; prices and schedules come from tonapi.io ({{ network }}).
    </p>
  </div>
</template>
