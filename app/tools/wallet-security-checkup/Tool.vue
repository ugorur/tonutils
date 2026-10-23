<script setup lang="ts">
import type { Address } from '@ton/core'
import { fetchAccountNfts } from '~/lib/nfts-write/chain'
import RiskList from '~/lib/security/RiskList.vue'
import { type Check, detectPoisoning, fetchEvents, sortChecks, worst } from '~/lib/security/core'
import type { TonapiAccount, TonapiJettonBalance } from '~/lib/wallet-actions/core'
import { type AccountReport, inspectAccount } from '~/lib/wallet-detection/state'
import { checkup, EXAMPLE, type Expiring, type Subscription } from './logic'

const tonapi = useTonapi()
const ton = useToncenter()
const tc = useTonConnect()
const { network, isTestnet } = useTonNetwork()

const text = ref('')
const addr = shallowRef<Address | null>(null)
watch(() => tc.wallet.value, (w) => {
  if (w && !tc.networkMismatch.value && !text.value) text.value = w.friendly
}, { immediate: true })

const checks = shallowRef<Check[] | null>(null)
/** The address the shown checklist belongs to (the input may have been edited since). */
const checked = ref('')
const partial = ref<string[]>([])
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
let session = 0

async function run() {
  if (!addr.value) return
  const my = ++session
  const target = addr.value
  const raw = target.toRawString().toLowerCase()
  loading.value = true
  error.value = null
  checks.value = null
  partial.value = []
  // Each source is optional: a failing one is reported, the rest of the checkup still runs.
  const soft = <T,>(what: string, p: Promise<T>) => p.catch(() => {
    partial.value.push(what)
    return null
  })
  try {
    stage.value = 'Reading the account…'
    // toncenter and tonapi have separate queues, so the contract state loads while tonapi works.
    const stateP = soft('wallet contract data', ton.v3<{ code: string | null, data: string | null, status: string }>('account', { address: raw }).catch((e: { status?: number }) => {
      if (e.status === 404) return null
      throw e
    }))
    const account = await tonapi.get<TonapiAccount>(`accounts/${raw}`)
    let report: AccountReport | null = null
    let subscriptions: Subscription[] | null = null
    const state = await stateP
    if (state?.code) report = inspectAccount(state.code, state.data, { workchain: target.workChain, testOnly: isTestnet.value })
    if (report?.wallet?.version.startsWith('v4')) {
      stage.value = 'Reading subscriptions…'
      subscriptions = (await soft('subscriptions', tonapi.get<{ subscriptions: Subscription[] }>(`accounts/${raw}/subscriptions`)))?.subscriptions ?? null
    }
    stage.value = 'Checking tokens…'
    const jettons = (await soft('tokens', tonapi.get<{ balances: TonapiJettonBalance[] }>(`accounts/${raw}/jettons`)))?.balances ?? null
    stage.value = 'Checking NFTs…'
    const nfts = (await soft('NFTs', fetchAccountNfts(tonapi.get, raw, { maxItems: 500, onPage: n => (stage.value = `Checking NFTs (${n})…`) })))?.items ?? null
    stage.value = 'Scanning history for address poisoning…'
    const events = await soft('history', fetchEvents(tonapi.get, raw, 100))
    stage.value = 'Checking .ton domains…'
    const expiring = (await soft('domains', tonapi.get<{ items: Expiring[] }>(`accounts/${raw}/dns/expiring`, { period: 60 })))?.items ?? null
    if (my !== session) return
    checked.value = target.toString({ bounceable: false, testOnly: isTestnet.value, urlSafe: true })
    checks.value = sortChecks(checkup({
      account, report, jettons, nfts, expiring, subscriptions,
      poison: events ? detectPoisoning(events.events, raw, isTestnet.value) : null
    }))
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example() {
  text.value = EXAMPLE
  nextTick(run)
}
watch(network, () => {
  checks.value = null
})

const level = computed(() => (checks.value ? worst(checks.value) : null))
const counts = computed(() => ({
  danger: checks.value?.filter(c => c.level === 'danger').length ?? 0,
  warn: checks.value?.filter(c => c.level === 'warn').length ?? 0,
  ok: checks.value?.filter(c => c.level === 'ok').length ?? 0
}))
const VERDICT = {
  danger: { color: 'error', icon: 'i-lucide-octagon-x', title: 'Needs attention now' },
  warn: { color: 'warning', icon: 'i-lucide-triangle-alert', title: 'A few things to clean up' },
  info: { color: 'success', icon: 'i-lucide-circle-check', title: 'Looks healthy' },
  ok: { color: 'success', icon: 'i-lucide-circle-check', title: 'Looks healthy' }
} as const
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="run">
      <AddressInput v-model="text" label="Wallet address" placeholder="Your wallet (filled in when you connect)" @parsed="addr = $event" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton type="submit" label="Run checkup" icon="i-lucide-stethoscope" :loading="loading" :disabled="!addr" />
        <UButton label="Try an example wallet" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
      <p class="text-xs text-muted">
        Read-only: about 6–10 public API calls, ~10 seconds. Connecting a wallet only fills in the address.
      </p>
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not run the checkup" @retry="run" />

    <template v-if="checks && level && !loading">
      <UAlert
        :color="VERDICT[level].color"
        variant="subtle"
        :icon="VERDICT[level].icon"
        :title="VERDICT[level].title"
        :description="`${counts.danger} critical · ${counts.warn} warning${counts.warn === 1 ? '' : 's'} · ${counts.ok} passed on ${network}`"
        data-testid="verdict"
      />
      <p v-if="partial.length" class="text-xs text-warning">
        Could not load: {{ partial.join(', ') }}. Those checks are missing; try again in a few seconds.
      </p>
      <RiskList title="Checklist" :checks="checks" />
      <ExplorerLinks :value="checked" />
    </template>
  </div>
</template>
