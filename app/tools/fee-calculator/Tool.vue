<script setup lang="ts">
import type { Workchain } from '~/lib/fees-time/fees'
import { useFeeConfig } from '~/lib/fees-time/useFeeConfig'
import type { BocKind, DurationUnit } from './logic'
import { BOC_KINDS, bocStats, computeFees, DURATION_UNITS, EXAMPLE, parseCount, priceRows, toSeconds } from './logic'

const { network, config, fetchedAt, loading, error, refresh } = useFeeConfig()

const workchain = ref<Workchain>('basechain')
const wcItems = [
  { label: 'Basechain (0)', value: 'basechain' },
  { label: 'Masterchain (-1)', value: 'masterchain' }
]

// gas
const gasText = ref('')
const gas = computed(() => parseCount(gasText.value))

// message
const msgMode = ref<'count' | 'boc'>('count')
const msgTabs = [
  { label: 'Cells & bits', value: 'count', icon: 'i-lucide-grid-2x2' },
  { label: 'Paste BOC', value: 'boc', icon: 'i-lucide-clipboard-paste' }
]
const msgCells = ref('')
const msgBits = ref('')
const msgBoc = ref('')
const bocKind = ref<BocKind>('message')
const msg = computed<{ ok: true, cells: bigint, bits: bigint } | { ok: false, error?: string } | null>(() => {
  if (msgMode.value === 'boc') {
    if (!msgBoc.value.trim()) return null
    try {
      return { ok: true, ...bocStats(msgBoc.value, bocKind.value) }
    }
    catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  if (!msgCells.value.trim() && !msgBits.value.trim()) return null
  const cells = parseCount(msgCells.value || '0')
  const bits = parseCount(msgBits.value || '0')
  return cells === null || bits === null ? { ok: false, error: 'Use whole numbers' } : { ok: true, cells, bits }
})

// storage
const stCells = ref('')
const stBits = ref('')
const stDuration = ref('1')
const stUnit = ref<DurationUnit>('years')
const storage = computed(() => {
  if (!stCells.value.trim() && !stBits.value.trim()) return null
  const cells = parseCount(stCells.value || '0')
  const bits = parseCount(stBits.value || '0')
  const seconds = toSeconds(stDuration.value, stUnit.value)
  return cells === null || bits === null || seconds === null ? null : { cells, bits, seconds }
})

const exampleLoaded = ref(false)
function loadExample() {
  workchain.value = 'basechain'
  gasText.value = EXAMPLE.gas
  msgMode.value = 'boc'
  msgBoc.value = EXAMPLE.messageBoc
  bocKind.value = 'message'
  stCells.value = EXAMPLE.storageCells
  stBits.value = EXAMPLE.storageBits
  stDuration.value = EXAMPLE.storageSeconds
  stUnit.value = 'seconds'
  exampleLoaded.value = true
}
watch([gasText, msgBoc, stCells, stBits, stDuration, workchain], () => {
  if (exampleLoaded.value && (gasText.value !== EXAMPLE.gas || msgBoc.value !== EXAMPLE.messageBoc || stDuration.value !== EXAMPLE.storageSeconds || workchain.value !== 'basechain')) exampleLoaded.value = false
})

const result = computed(() => {
  if (!config.value) return null
  return computeFees(config.value, workchain.value, {
    gas: gas.value,
    msg: msg.value?.ok ? { cells: msg.value.cells, bits: msg.value.bits } : null,
    storage: storage.value
  })
})
const prices = computed(() => (config.value ? priceRows(config.value, workchain.value) : []))
const nano = (v: bigint) => `${groupThousands(String(v))} ${NANO_NAME}`
const fmt = (v: bigint) => formatCoin(v)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <URadioGroup v-model="workchain" :items="wcItems" orientation="horizontal" variant="table" size="sm" />
      <UButton icon="i-lucide-flask-conical" variant="soft" size="sm" label="Load a real transaction" data-testid="example" @click="loadExample" />
    </div>

    <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
      <UIcon name="i-lucide-radio-tower" class="size-4" />
      <span v-if="loading">Reading config params 18/20/21/24/25 from {{ network }}…</span>
      <span v-else-if="fetchedAt">Live {{ network }} prices (config 18/20/21/24/25), read {{ fetchedAt.toLocaleTimeString() }}.</span>
      <UButton v-if="!loading" size="xs" variant="ghost" icon="i-lucide-refresh-cw" label="Refresh" @click="refresh" />
    </div>
    <ErrorNotice :error="error" title="Could not read the network config" @retry="refresh" />
    <LoadingState v-if="loading && !config" label="Loading live fee prices…" />

    <div class="grid gap-4 md:grid-cols-2">
      <!-- GAS -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-cpu" class="size-4 text-primary" /> Gas (compute phase)
          </div>
        </template>
        <div class="space-y-3">
          <UFormField label="Gas used" hint="e.g. 3308" :error="gasText.trim() && gas === null ? 'Whole number of gas units' : undefined">
            <UInput v-model="gasText" inputmode="numeric" placeholder="3308" class="w-full" :ui="{ base: 'font-mono' }" data-testid="gas" />
          </UFormField>
          <p class="text-xs text-dimmed">
            Find it as <code class="font-mono">gas_used</code> in an explorer's transaction details or emulator output.
          </p>
          <ResultField v-if="result?.gas != null" label="Gas fee" :value="fmt(result.gas)" :hint="nano(result.gas)" />
        </div>
      </UCard>

      <!-- STORAGE -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-hard-drive" class="size-4 text-primary" /> Storage (rent)
          </div>
        </template>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Cells">
              <UInput v-model="stCells" inputmode="numeric" placeholder="22" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
            <UFormField label="Bits">
              <UInput v-model="stBits" inputmode="numeric" placeholder="5697" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
          </div>
          <div class="grid grid-cols-[1fr_auto] gap-3">
            <UFormField label="For">
              <UInput v-model="stDuration" inputmode="decimal" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
            <UFormField label="Unit">
              <USelect v-model="stUnit" :items="DURATION_UNITS.map(u => ({ label: u.label, value: u.value }))" class="w-36" />
            </UFormField>
          </div>
          <p class="text-xs text-dimmed">
            Have an address? The <NuxtLink to="/tools/storage-rent-estimator" class="text-primary underline">storage rent estimator</NuxtLink> reads its size for you.
          </p>
          <ResultField v-if="result?.storage != null" label="Storage fee" :value="fmt(result.storage)" :hint="nano(result.storage)" />
        </div>
      </UCard>
      <!-- FORWARD -->
      <UCard class="md:col-span-2">
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-send" class="size-4 text-primary" /> Forward fee (per message)
          </div>
        </template>
        <div class="space-y-3">
          <UTabs v-model="msgMode" :items="msgTabs" :content="false" size="xs" class="w-full" />
          <div v-if="msgMode === 'count'" class="grid grid-cols-2 gap-3">
            <UFormField label="Cells" hint="excl. root">
              <UInput v-model="msgCells" inputmode="numeric" placeholder="0" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
            <UFormField label="Bits" hint="excl. root">
              <UInput v-model="msgBits" inputmode="numeric" placeholder="0" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
          </div>
          <template v-else>
            <UFormField label="Message or body BOC" :error="msg && !msg.ok ? msg.error : undefined">
              <UTextarea v-model="msgBoc" :rows="3" autoresize :maxrows="8" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc… or b5ee9c72…" spellcheck="false" data-testid="boc" />
            </UFormField>
            <URadioGroup v-model="bocKind" :items="BOC_KINDS" size="sm" />
          </template>
          <p v-if="msg?.ok" class="font-mono text-xs text-muted">
            Paid for: {{ msg.cells }} cells, {{ msg.bits }} bits (root is covered by the lump price)
          </p>
          <template v-if="result?.fwd">
            <ResultField label="Total forward fee (paid by the sender)" :value="fmt(result.fwd.total)" :hint="nano(result.fwd.total)" />
            <div class="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              <ResultField label="Kept in sender's action fees" :value="nano(result.fwd.action)" :copy="false" />
              <ResultField label="Written to the message (fwd_fee)" :value="nano(result.fwd.remaining)" :copy="false" />
            </div>
            <p class="text-xs text-dimmed">
              For an incoming external message the receiving contract pays the full amount as its import fee.
            </p>
          </template>
        </div>
      </UCard>

    </div>

    <div v-if="result && result.total > 0n" class="rounded-lg border border-default bg-elevated/50 p-4">
      <ResultField label="Sum of the fees above" :value="fmt(result.total)" :hint="`${nano(result.total)} · gas + forward + storage`" />
      <UAlert
        v-if="exampleLoaded && network === 'mainnet' && workchain === 'basechain'"
        class="mt-3"
        :color="result.gas === EXAMPLE.onChain.gas && result.fwd?.total === EXAMPLE.onChain.fwdTotal && result.storage === EXAMPLE.onChain.storage ? 'success' : 'warning'"
        variant="subtle"
        icon="i-lucide-badge-check"
        title="Compared with the real transaction"
        data-testid="example-check"
      >
        <template #description>
          <p>On chain: gas {{ nano(EXAMPLE.onChain.gas) }}, forward {{ nano(EXAMPLE.onChain.fwdTotal) }} ({{ nano(EXAMPLE.onChain.fwdAction) }} + {{ nano(EXAMPLE.onChain.fwdRemaining) }}), storage {{ nano(EXAMPLE.onChain.storage) }}. Prices may have changed since, if a value differs.</p>
          <ExplorerLinks kind="tx" :value="EXAMPLE.txHash" network="mainnet" class="mt-2" />
        </template>
      </UAlert>
    </div>

    <UCollapsible v-if="config" :default-open="false">
      <UButton variant="ghost" color="neutral" trailing-icon="i-lucide-chevron-down" :label="`Current ${workchain} prices`" />
      <template #content>
        <KeyValue :items="prices.map(p => ({ ...p, mono: false, copy: false }))" class="px-1" />
      </template>
    </UCollapsible>
  </div>
</template>
