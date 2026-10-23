<script setup lang="ts">
// Derived wallet addresses as cards, with an opt-in balance check (sends only the public addresses to toncenter).
import type { TonNetwork } from '~/composables/useTonNetwork'
import type { WalletRow } from './wallets'

const props = withDefaults(defineProps<{
  wallets: WalletRow[]
  network: TonNetwork
  /** How many cards to show before "Show older versions". */
  visible?: number
}>(), { visible: 3 })

interface AccountState { address: string, balance: string, status: string }
const toncenter = useToncenter(() => props.network)
const states = ref<Map<string, AccountState> | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const expanded = ref(false)

watch(() => [props.wallets, props.network], () => {
  states.value = null
  error.value = null
})

async function checkBalances() {
  loading.value = true
  error.value = null
  try {
    const res = await toncenter.v3<{ accounts: AccountState[] }>('accountStates', {
      address: props.wallets.map(w => w.raw).join(','),
      include_boc: false
    })
    states.value = new Map(res.accounts.map(a => [a.address.toLowerCase(), a]))
    if (props.wallets.slice(props.visible).some(w => stateOf(w)?.status === 'active')) expanded.value = true
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function stateOf(w: WalletRow): AccountState | undefined {
  return states.value?.get(w.raw.toLowerCase())
}

const shown = computed(() => expanded.value ? props.wallets : props.wallets.slice(0, props.visible))
const funded = computed(() => props.wallets.filter(w => BigInt(stateOf(w)?.balance ?? 0) > 0n))

const STATUS: Record<string, { label: string, color: 'success' | 'neutral' | 'warning' }> = {
  active: { label: 'Active', color: 'success' },
  uninit: { label: 'Not deployed', color: 'neutral' },
  frozen: { label: 'Frozen', color: 'warning' },
  nonexist: { label: 'Never used', color: 'neutral' }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        :label="states ? 'Refresh balances' : 'Check balances'"
        icon="i-lucide-search"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="loading"
        @click="checkBalances"
      />
      <span class="text-xs text-dimmed">Sends only these public addresses to toncenter ({{ network }}).</span>
    </div>

    <ErrorNotice :error="error" title="Could not load balances" @retry="checkBalances" />

    <UAlert
      v-if="states && !loading"
      :color="funded.length ? 'success' : 'neutral'"
      variant="subtle"
      :icon="funded.length ? 'i-lucide-wallet' : 'i-lucide-info'"
      :title="funded.length
        ? `Funds found in ${funded.map(w => w.label).join(', ')}`
        : `No ${COIN_SYMBOL} balance on any of these addresses (${network})`"
      :description="funded.length ? undefined : 'Check the other network, workchain or wallet version, or a different derivation path.'"
    />

    <div
      v-for="w in shown"
      :key="w.version"
      class="rounded-lg border px-4 py-1"
      :class="stateOf(w)?.status === 'active' ? 'border-primary/50' : 'border-default'"
    >
      <div class="flex flex-wrap items-center gap-2 pt-2">
        <span class="text-sm font-medium text-highlighted">{{ w.label }}</span>
        <template v-if="states">
          <UBadge
            :label="STATUS[stateOf(w)?.status ?? 'nonexist']?.label ?? stateOf(w)?.status"
            :color="STATUS[stateOf(w)?.status ?? 'nonexist']?.color ?? 'neutral'"
            variant="subtle"
            size="sm"
          />
          <TokenAmount v-if="stateOf(w)" :nano="stateOf(w)!.balance" class="text-sm" />
        </template>
        <span v-if="w.walletId !== undefined" class="ml-auto font-mono text-xs text-dimmed">id {{ w.walletId >>> 0 }}</span>
      </div>
      <div class="divide-y divide-default">
        <ResultField label="Receive address (non-bounceable)" :value="w.nonBounceable">
          <span>{{ w.nonBounceable }}</span>
          <div class="mt-1 font-sans">
            <ExplorerLinks :value="w.nonBounceable" :network="network" />
          </div>
        </ResultField>
        <ResultField label="Bounceable" :value="w.bounceable" />
        <ResultField label="Raw" :value="w.raw" />
      </div>
    </div>

    <UButton
      v-if="wallets.length > visible"
      :label="expanded ? 'Show fewer versions' : `Show ${wallets.length - visible} older version${wallets.length - visible === 1 ? '' : 's'}`"
      :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="expanded = !expanded"
    />
  </div>
</template>
