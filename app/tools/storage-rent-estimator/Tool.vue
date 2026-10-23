<script setup lang="ts">
import type { Address } from '@ton/core'
import { useFeeConfig } from '~/lib/fees-time/useFeeConfig'
import type { AccountStatus, TonapiRawAccount } from './logic'
import { accountToInput, dateOf, describeFrom, estimateRent } from './logic'

const EXAMPLES = [
  { label: 'USD₮ master', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
  { label: 'W5 wallet', value: 'UQBNptKtYdpPkOMZCVglVWaQ0PwwNHDxkYb6NvIyDcUTgcrl' }
]

const { network, config, loading: cfgLoading, error: cfgError, refresh } = useFeeConfig()
const tonapi = useTonapi(network)

const mode = ref<'address' | 'manual'>('address')
const modeTabs = [
  { label: 'By address', value: 'address', icon: 'i-lucide-at-sign' },
  { label: 'By size', value: 'manual', icon: 'i-lucide-ruler' }
]

// address mode
const addressText = ref('')
const parsed = ref<Address | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const account = ref<(ReturnType<typeof accountToInput> & { address: string }) | null>(null)
let run = 0

async function lookup() {
  const a = parsed.value
  if (!a) return
  const id = ++run
  loading.value = true
  error.value = null
  account.value = null
  try {
    const raw = a.toRawString()
    const res = await tonapi.get<TonapiRawAccount>(`blockchain/accounts/${raw}`)
    if (id === run) account.value = { ...accountToInput(res), address: raw }
  }
  catch (e) {
    if (id !== run) return
    // tonapi answers 404 for addresses that were never used
    if (e instanceof TonApiError && e.status === 404) account.value = { cells: 0n, bits: 0n, balance: 0n, due: 0n, lastPaid: 0, status: 'nonexist', masterchain: a.workChain === -1, address: a.toRawString() }
    else error.value = e
  }
  finally {
    if (id === run) loading.value = false
  }
}
function useExample(v: string) {
  addressText.value = v
  nextTick(lookup)
}
watch(network, () => {
  account.value = null
})

// manual mode
const mCells = ref('22')
const mBits = ref('5697')
const mBalance = ref('0.05')
const mBalanceNano = ref<bigint | null>(null)
const mWorkchain = ref<'0' | '-1'>('0')

// shared
const years = ref(5)
const toInt = (s: string) => (/^\d{1,15}$/.test(s.trim()) ? BigInt(s.trim()) : null)

const input = computed(() => {
  if (mode.value === 'address') return account.value
  const cells = toInt(mCells.value)
  const bits = toInt(mBits.value)
  if (cells === null || bits === null || mBalanceNano.value === null) return null
  return { cells, bits, balance: mBalanceNano.value, due: 0n, lastPaid: 0, status: 'active' as AccountStatus, masterchain: mWorkchain.value === '-1' }
})

const result = computed(() => {
  const c = config.value
  const i = input.value
  if (!c || !i) return null
  const g = i.masterchain ? c.gas.masterchain : c.gas.basechain
  const now = Math.floor(Date.now() / 1000)
  return { now, ...estimateRent({ ...i, prices: c.storage, freezeDueLimit: g.freezeDueLimit, deleteDueLimit: g.deleteDueLimit, now, years: Math.max(0, Math.min(1000, years.value || 0)) }) }
})

const STATUS: Record<AccountStatus, { label: string, color: 'success' | 'neutral' | 'info' | 'warning' }> = {
  active: { label: 'Active', color: 'success' },
  uninit: { label: 'Uninitialized', color: 'neutral' },
  frozen: { label: 'Frozen', color: 'info' },
  nonexist: { label: 'Does not exist', color: 'neutral' }
}

function when(at: number | null) {
  const now = result.value?.now ?? Math.floor(Date.now() / 1000)
  if (at === null) return { value: 'Never', hint: undefined }
  const d = dateOf(at)
  return { value: d ?? describeFrom(now, at), hint: d ? describeFrom(now, at) : undefined }
}
const nano = (v: bigint) => `${groupThousands(String(v))} ${NANO_NAME}`
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="mode" :items="modeTabs" :content="false" class="w-full" />

    <div v-if="mode === 'address'" class="space-y-3">
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="lookup">
        <AddressInput v-model="addressText" class="flex-1" label="Account address" @parsed="a => (parsed = a)" />
        <UButton type="submit" size="lg" icon="i-lucide-search" label="Estimate" :loading="loading" :disabled="!parsed" class="justify-center" data-testid="lookup" />
      </form>
      <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
        Try:
        <UButton v-for="e in EXAMPLES" :key="e.value" size="xs" variant="soft" :label="e.label" @click="useExample(e.value)" />
      </div>
      <ErrorNotice :error="error" @retry="lookup" />
      <LoadingState v-if="loading" label="Reading the account from tonapi…" />
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UFormField label="Cells" hint="incl. root">
        <UInput v-model="mCells" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }" />
      </UFormField>
      <UFormField label="Bits">
        <UInput v-model="mBits" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }" />
      </UFormField>
      <AmountInput v-model="mBalance" v-model:nano="mBalanceNano" label="Balance" />
      <UFormField label="Workchain">
        <USelect v-model="mWorkchain" :items="[{ label: 'Basechain (0)', value: '0' }, { label: 'Masterchain (-1)', value: '-1' }]" class="w-full" />
      </UFormField>
    </div>

    <ErrorNotice :error="cfgError" title="Could not read storage prices (config 18/20/21)" @retry="refresh" />
    <LoadingState v-if="cfgLoading && !config" label="Loading live storage prices…" />

    <template v-if="result && input">
      <div v-if="mode === 'address' && account" class="flex flex-wrap items-center gap-3">
        <UBadge :color="STATUS[account.status].color" variant="subtle" size="lg" :label="STATUS[account.status].label" />
        <span class="text-sm text-muted">{{ account.masterchain ? 'Masterchain' : 'Basechain' }} · {{ input.cells }} cells · {{ groupThousands(String(input.bits)) }} bits</span>
        <ExplorerLinks :value="account.address" />
      </div>

      <UAlert v-if="input.status === 'nonexist'" color="neutral" variant="subtle" icon="i-lucide-info" title="Nothing stored yet" description="This account is not on chain (never used, or deleted after unpaid rent), so it pays no rent. Rent starts once it receives coins (an uninitialized account) or a contract is deployed." />
      <UAlert v-else-if="result.free" color="neutral" variant="subtle" icon="i-lucide-info" title="No rent" description="This account stores nothing chargeable at the current prices." />

      <div v-else class="grid gap-4 md:grid-cols-2">
        <UCard>
          <KeyValue
            :items="[
              { label: 'Rent per year', value: formatCoin(result.perYear), hint: `${nano(result.perDay)} per day at today's config 18 prices` },
              { label: 'Balance', value: formatCoin(input.balance), copy: false },
              { label: 'Owed right now', value: formatCoin(result.owedNow), hint: input.lastPaid ? `Charged at the next transaction: rent since ${new Date(input.lastPaid * 1000).toISOString().replace('T', ' ').slice(0, 16)} UTC${input.due ? ' plus recorded debt' : ''}` : 'No last-paid time: counted from now' }
            ]"
          />
        </UCard>
        <UCard>
          <KeyValue
            :items="[
              { label: 'Balance stops covering rent', ...when(result.emptyAt), copy: false, mono: false },
              ...(input.status === 'active' ? [{ label: `Earliest freeze (debt over ${formatCoin(input.masterchain ? config!.gas.masterchain.freezeDueLimit : config!.gas.basechain.freezeDueLimit)})`, ...when(result.freezeAt), copy: false, mono: false }] : []),
              { label: `Earliest deletion (debt over ${formatCoin(input.masterchain ? config!.gas.masterchain.deleteDueLimit : config!.gas.basechain.deleteDueLimit)})`, ...when(result.deleteAt), copy: false, mono: false }
            ]"
          />
        </UCard>
      </div>

      <UCard v-if="!result.free && input.status !== 'nonexist'">
        <div class="grid items-end gap-4 sm:grid-cols-[12rem_1fr]">
          <UFormField label="Keep it alive for (years)">
            <UInputNumber v-model="years" :min="0" :max="1000" class="w-full" />
          </UFormField>
          <div class="grid gap-x-4 sm:grid-cols-2">
            <ResultField label="Needed for rent" :value="formatCoin(result.keepFor)" :hint="`Owed now + ${years} years of rent`" />
            <ResultField label="Top up" :value="formatCoin(result.topUp)" :hint="result.topUp ? 'Send at least this to cover the period' : 'The balance already covers it'" />
          </div>
        </div>
      </UCard>

      <p class="text-xs text-dimmed">
        Freezing and deletion only happen when a transaction touches the account, so the real date is the first transaction after the one shown. Projections assume today's prices and size stay the same; a frozen account stores much less, so its deletion usually comes later. Rent never takes more than the balance: the rest is recorded as debt.
        <template v-if="input.status === 'frozen'">
          To bring a frozen account back, see the <NuxtLink to="/tools/unfreeze-account" class="text-primary underline">unfreeze tool</NuxtLink>.
        </template>
      </p>
    </template>
  </div>
</template>
