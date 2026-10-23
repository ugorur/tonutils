<script setup lang="ts">
import type { Address } from '@ton/core'
import JettonPicker from '~/lib/jettons-read/JettonPicker.vue'
import { friendly, toRaw } from '~/lib/jettons-read/core'
import { loadSandbox } from '~/utils/lazy'
import { USDT_MASTER } from '~/utils/ton/jetton'
import type { MasterState } from './logic'
import { ownerStack, parseOwners, walletFromStack } from './logic'

const MAX_OWNERS = 5000
// Bybit and Binance hot wallets: real USD₮ holders (tonapi holders list).
const EXAMPLE = 'UQBKHCC8mm-SlPdfHIen84OotzpIOi5tyzYw3b54s8ytAIWX\nUQDKHZ7e70CzqdvZCC83Z4WVR8POC_ZB0J1Y4zo88G-zCSRH'

const route = useRoute()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const toncenter = useToncenter()

const masterInput = ref(typeof route.query.jetton === 'string' ? route.query.jetton : isTestnet.value ? '' : USDT_MASTER)
const ownersText = ref(typeof route.query.owner === 'string' ? route.query.owner : '')
const masterRaw = computed(() => {
  try {
    return masterInput.value.trim() ? toRaw(masterInput.value) : null
  }
  catch {
    return null
  }
})
const owners = computed(() => parseOwners(ownersText.value))
const valid = computed(() => owners.value.filter(o => o.address))
const problems = computed(() => owners.value.filter(o => o.error))

interface ResultRow { owner: string, wallet: string }
const loading = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const results = ref<ResultRow[]>([])
const method = ref<'getter' | 'emulated' | null>(null)
const verified = ref<boolean | null>(null)
let runId = 0

/** On-chain getter through tonapi: one request per owner. */
async function getter(master: string, owner: Address): Promise<string> {
  const r = await tonapi.get<{ success: boolean, exit_code: number, decoded?: { jetton_wallet_address?: string } }>(`blockchain/accounts/${master}/methods/get_wallet_address`, { args: owner.toRawString() })
  const w = r.decoded?.jetton_wallet_address
  if (!r.success || !w) throw new Error(`get_wallet_address failed on this contract (exit code ${r.exit_code}). Is it a jetton master?`)
  return w.toLowerCase()
}

async function run() {
  const master = masterRaw.value
  const list = valid.value.slice(0, MAX_OWNERS).map(o => o.address!)
  if (!master || !list.length) return
  const id = ++runId
  loading.value = true
  error.value = null
  results.value = []
  method.value = null
  verified.value = null
  try {
    if (list.length === 1) {
      progress.value = 'Asking the token contract…'
      const w = await getter(master, list[0]!)
      if (id !== runId) return
      results.value = [{ owner: list[0]!.toRawString(), wallet: w }]
      method.value = 'getter'
      return
    }
    progress.value = 'Downloading the token contract state…'
    const state = await toncenter.v3<MasterState>('account', { address: master })
    if (!state.code || !state.data || state.status !== 'active') throw new Error('This token contract is not active on this network, so its code cannot be run.')
    progress.value = 'Loading the TVM emulator (one-time ~7 MB)…'
    const sandbox = await loadSandbox()
    const out: ResultRow[] = []
    for (const [i, owner] of list.entries()) {
      const r = await sandbox.runGetMethod({ code: state.code, data: state.data, address: master, method: 'get_wallet_address', stack: ownerStack(owner), balance: BigInt(state.balance) })
      if (r.missingLibrary) throw new Error('This token contract needs a library cell the emulator does not have. Compute addresses one at a time instead.')
      if (r.exitCode !== 0 && r.exitCode !== 1) throw new Error(`get_wallet_address failed with exit code ${r.exitCode}. Is this a jetton master?`)
      out.push({ owner: owner.toRawString(), wallet: walletFromStack(r.stack).toRawString() })
      if (i % 200 === 199) {
        if (id !== runId) return
        progress.value = `Computed ${i + 1} / ${list.length}…`
        results.value = [...out]
        await new Promise(r => setTimeout(r))
      }
    }
    if (id !== runId) return
    results.value = out
    method.value = 'emulated'
    progress.value = 'Checking the first result against the live contract…'
    verified.value = (await getter(master, list[0]!)) === out[0]!.wallet
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

const fmt = (raw: string, bounceable: boolean) => friendly(raw, { bounceable, testnet: isTestnet.value })
const columns = [
  { accessorKey: 'owner', header: 'Owner' },
  { accessorKey: 'wallet', header: 'Jetton wallet' }
]
const csvRows = computed(() => results.value.map(r => ({
  owner: fmt(r.owner, false),
  jetton_wallet: fmt(r.wallet, true),
  jetton_wallet_raw: r.wallet
})))

function tryExample() {
  masterInput.value = USDT_MASTER
  ownersText.value = EXAMPLE
  run()
}

onMounted(() => {
  if (masterRaw.value && valid.value.length) run()
})
watch(network, () => {
  if (results.value.length) run()
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="run">
      <JettonPicker v-model="masterInput" />
      <UFormField label="Owner wallet(s)" :hint="`One per line, up to ${MAX_OWNERS}`" help="The wallet that owns the tokens (UQ…, EQ…, 0:…). CSV works: the first address on each line is used.">
        <UTextarea
          v-model="ownersText"
          :rows="3"
          autoresize
          :maxrows="12"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="UQ…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <p v-if="problems.length" class="text-xs text-error">
        Skipped {{ problems.length }} line{{ problems.length > 1 ? 's' : '' }}: {{ problems.slice(0, 5).map(p => `line ${p.line}`).join(', ') }}{{ problems.length > 5 ? '…' : '' }}
      </p>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" icon="i-lucide-calculator" :label="valid.length > 1 ? `Compute ${Math.min(valid.length, MAX_OWNERS)} addresses` : 'Compute address'" :loading="loading" :disabled="!masterRaw || !valid.length" />
        <UButton v-if="!isTestnet" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="progress" />
    <ErrorNotice :error="error" title="Could not compute the address" @retry="run" />

    <template v-if="results.length && !loading">
      <section v-if="method === 'getter'" class="rounded-lg border border-default p-4 sm:p-5">
        <ResultField label="Jetton wallet address" :value="fmt(results[0]!.wallet, true)" hint="Contracts use the bounceable (EQ…) form." />
        <ResultField label="Raw form" :value="results[0]!.wallet" />
        <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ExplorerLinks :value="fmt(results[0]!.wallet, true)" />
          <NuxtLink :to="`/tools/jetton-wallet-status?owner=${fmt(results[0]!.owner, false)}&jetton=${masterInput.trim()}`" class="text-xs text-primary hover:underline">
            Check if it is locked
          </NuxtLink>
          <NuxtLink :to="`/tools/jetton-history?owner=${fmt(results[0]!.owner, false)}&jetton=${masterInput.trim()}`" class="text-xs text-primary hover:underline">
            Transfer history
          </NuxtLink>
        </div>
        <p class="mt-3 text-xs text-dimmed">
          Returned by the token contract's own get_wallet_address method on-chain. The address is fixed even if the owner never received this token (the contract is then created by the first transfer).
        </p>
      </section>

      <section v-else>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-semibold text-highlighted">
            {{ results.length }} jetton wallet{{ results.length > 1 ? 's' : '' }}
          </h3>
          <CsvExportButton :rows="csvRows" filename="jetton-wallets" />
        </div>
        <UAlert
          v-if="verified !== null"
          class="mt-2"
          :color="verified ? 'success' : 'error'"
          variant="subtle"
          :icon="verified ? 'i-lucide-circle-check' : 'i-lucide-shield-alert'"
          :title="verified ? 'Computed in your browser and checked against the live contract' : 'Mismatch with the live contract'"
          :description="verified ? 'The token contract code ran locally in a TVM emulator; the first result matches the on-chain get_wallet_address.' : 'The local result differs from the on-chain getter (the contract may have changed). Compute addresses one at a time instead.'"
        />
        <UTable :data="results" :columns="columns" class="mt-2 max-h-[36rem]" sticky :ui="{ td: 'py-2', th: 'py-2' }">
          <template #owner-cell="{ row }">
            <AddressLink :address="row.original.owner" :bounceable="false" no-links />
          </template>
          <template #wallet-cell="{ row }">
            <AddressLink :address="row.original.wallet" no-links />
          </template>
        </UTable>
      </section>
    </template>
  </div>
</template>
