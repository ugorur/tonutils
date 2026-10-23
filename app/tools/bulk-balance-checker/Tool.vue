<script setup lang="ts">
import type { Address } from '@ton/core'
import type { DroppedFile } from '~/components/FileDrop.vue'
import { chunk, fetchAccountStates, resolveName, useAccountClients } from '~/lib/accounts/api'
import { formatUtc, friendly, parseAccountList, STATUS_INFO, timeAgo, toRaw } from '~/lib/accounts/core'
import { KNOWN_JETTONS } from '~/utils/ton/jetton'
import type { JettonPick, ResultRow, ToncenterJettonWallet } from './logic'
import { buildResults, csvRows, jettonBalancesByOwner, jettonFromTonapi, MAX_ROWS, summarize, trustedCodeHashes } from './logic'

// Real mainnet accounts: TON Foundation (by name and address), the USD₮ master, Binance, a W5 wallet, a fresh address and a typo.
const EXAMPLE = [
  'address,label',
  'foundation.ton,TON Foundation by name',
  'UQD5mxRgCuRNLxKxeOjG6r14iSroLF5FtomPnet-sgP5xI-e,Binance',
  'UQBNptKtYdpPkOMZCVglVWaQ0PwwNHDxkYb6NvIyDcUTgcrl,W5 whale',
  'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs,USDT master',
  'UQAtw6xDcJKE9xoY9Ke1T5EubKIaugpAw3OAfL2GCY8wKSt2,staker',
  '0:1234567812345678123456781234567812345678123456781234567812345678,never used',
  'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBX,typo'
].join('\n')
const SHOW = 500

const { isTestnet, network } = useTonNetwork()
const clients = useAccountClients(network)

const text = ref('')
const jettonChoice = ref('none')
const customMaster = ref('')
const customParsed = shallowRef<Address | null>(null)
const jettonItems = computed(() => [
  { label: 'No jetton', value: 'none' },
  ...(isTestnet.value ? [] : KNOWN_JETTONS.map(j => ({ label: `${j.symbol} (${j.name})`, value: j.master }))),
  { label: 'Other jetton (paste master address)', value: 'custom' }
])

const parsed = computed(() => parseAccountList(text.value))
const tooMany = computed(() => parsed.value.length > MAX_ROWS)

const loading = ref(false)
const progress = ref({ label: '', value: 0, max: 1 })
const error = ref<unknown>(null)
const extrasError = ref<unknown>(null)
const results = ref<ResultRow[]>([])
const jetton = ref<JettonPick | null>(null)
let runId = 0

async function run() {
  const id = ++runId
  const rows = parsed.value.slice(0, MAX_ROWS)
  if (!rows.length) return
  loading.value = true
  error.value = extrasError.value = null
  results.value = []
  try {
    // Jetton first, so a bad master fails fast.
    let pick: JettonPick | null = null
    if (jettonChoice.value !== 'none') {
      const master = jettonChoice.value === 'custom' ? customParsed.value && toRaw(customParsed.value) : toRaw(jettonChoice.value)
      if (!master) throw new Error('Enter a valid jetton master address, or choose "No jetton".')
      const known = KNOWN_JETTONS.find(j => toRaw(j.master) === master)
      pick = known && !isTestnet.value
        ? { master, symbol: known.symbol, decimals: known.decimals }
        : { ...jettonFromTonapi(await clients.tonapi(`jettons/${master}`)), master }
    }
    jetton.value = pick

    const domains = [...new Set(rows.filter(r => r.domain && !r.duplicateOf).map(r => r.domain!))]
    const names = new Map<string, string | Error>()
    for (const [i, d] of domains.entries()) {
      progress.value = { label: `Resolving names ${i + 1} / ${domains.length}…`, value: i, max: domains.length }
      names.set(d, await resolveName(d, clients).catch((e: Error) => e))
      if (id !== runId) return
    }
    const raws = [...new Set([...rows.flatMap(r => r.raw && !r.duplicateOf ? [r.raw] : []), ...[...names.values()].filter((v): v is string => typeof v === 'string')])]

    const res = await fetchAccountStates(raws, clients, (done, total) => {
      if (id === runId) progress.value = { label: `Loading balances ${done} / ${total}…`, value: done, max: total || 1 }
    })
    if (id !== runId) return
    extrasError.value = res.extrasError ?? null

    let balances: Map<string, bigint> | undefined
    if (pick) {
      const wallets: ToncenterJettonWallet[] = []
      progress.value = { label: `Checking the ${pick.symbol} master…`, value: 0, max: 1 }
      const [masterHash, top] = await Promise.all([
        clients.v3<{ jetton_masters: { jetton_wallet_code_hash?: string | null }[] }>('jetton/masters', { address: pick.master })
          .then(r => r.jetton_masters[0]?.jetton_wallet_code_hash ?? null),
        clients.v3<{ jetton_wallets: ToncenterJettonWallet[] }>('jetton/wallets', { jetton_address: pick.master, limit: 50, sort: 'desc' })
          .then(r => r.jetton_wallets)
      ])
      const codeHashes = trustedCodeHashes(masterHash, top)
      if (id !== runId) return
      const batches = chunk(raws)
      for (const [i, b] of batches.entries()) {
        progress.value = { label: `Loading ${pick.symbol} balances ${i + 1} / ${batches.length}…`, value: i, max: batches.length }
        const qs = b.map(a => `owner_address=${encodeURIComponent(a)}`).join('&')
        const r = await clients.v3<{ jetton_wallets: ToncenterJettonWallet[] }>(`jetton/wallets?${qs}`, { jetton_address: pick.master, limit: 1000 })
        wallets.push(...r.jetton_wallets)
        if (id !== runId) return
      }
      balances = jettonBalancesByOwner(wallets, pick.master, codeHashes)
    }
    results.value = buildResults(rows, names, res.states, balances)
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}

watch(network, () => {
  results.value = []
  jettonChoice.value = 'none'
})

function onFile(f: DroppedFile) {
  text.value = f.text ?? ''
}
function tryExample() {
  text.value = EXAMPLE
  jettonChoice.value = isTestnet.value ? 'none' : KNOWN_JETTONS[0]!.master
  run()
}

const summary = computed(() => summarize(results.value))
const filter = ref<'all' | 'funded' | 'problems'>('all')
const sort = ref<'input' | 'balance' | 'jetton'>('input')
const filtered = computed(() => {
  let rows = results.value
  if (filter.value === 'funded') rows = rows.filter(r => (r.state?.balance ?? 0n) > 0n || (r.jetton ?? 0n) > 0n)
  if (filter.value === 'problems') rows = rows.filter(r => r.status !== 'ok')
  if (sort.value !== 'input') {
    const key = (r: ResultRow) => (sort.value === 'balance' ? r.state?.balance : r.jetton) ?? -1n
    rows = [...rows].sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0))
  }
  return rows
})
const shown = computed(() => filtered.value.slice(0, SHOW))
const exportRows = computed(() => csvRows(results.value, { testnet: isTestnet.value, jetton: jetton.value, coin: COIN_SYMBOL }))

// Status and contract type are a badge under the account. Phones also fold the jetton balance under
// the GRAM balance and hide the line number and last activity.
const wide = { class: { th: 'hidden sm:table-cell', td: 'hidden sm:table-cell' } }
const columns = computed(() => [
  { accessorKey: 'line', header: '#', meta: wide },
  { accessorKey: 'input', header: 'Account' },
  { accessorKey: 'balance', header: `${COIN_SYMBOL} balance` },
  ...(jetton.value ? [{ accessorKey: 'jetton', header: jetton.value.symbol, meta: wide }] : []),
  { accessorKey: 'activity', header: 'Last activity', meta: wide }
])

const PROBLEM = {
  invalid: { label: 'Invalid', color: 'error' },
  unresolved: { label: 'Not resolved', color: 'error' },
  duplicate: { label: 'Duplicate', color: 'warning' }
} as const
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <UFormField label="Accounts" :hint="`Up to ${MAX_ROWS.toLocaleString('en-US')}`" help="One per line: EQ…, UQ…, 0:… or a .ton / .t.me name. In a CSV the first address on each row is used and the rest becomes the label.">
        <UTextarea
          v-model="text"
          :rows="6"
          autoresize
          :maxrows="14"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="UQ…, label&#10;foundation.ton"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <FileDrop v-if="!text" accept=".csv,.txt,.tsv,text/plain,text/csv" text :max-bytes="2 * 1024 * 1024" label="Or drop a .csv / .txt file" @file="onFile" />
      <p v-if="tooMany" class="text-xs text-warning">
        {{ parsed.length.toLocaleString('en-US') }} lines found. Only the first {{ MAX_ROWS.toLocaleString('en-US') }} are checked.
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Also check a jetton balance (optional)">
          <USelect v-model="jettonChoice" :items="jettonItems" class="w-full" />
        </UFormField>
        <AddressInput v-if="jettonChoice === 'custom'" v-model="customMaster" label="Jetton master address" placeholder="EQ… (the token's master contract)" @parsed="customParsed = $event" />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton label="Check balances" icon="i-lucide-play" :loading="loading" :disabled="!parsed.length" @click="run" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
        <UButton v-if="text" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="text = ''; results = []" />
      </div>
    </div>

    <div v-if="loading" class="space-y-2" role="status" aria-live="polite">
      <div class="text-sm text-muted">
        {{ progress.label }}
      </div>
      <UProgress :model-value="progress.value" :max="progress.max" size="sm" />
      <p class="text-xs text-dimmed">
        Public APIs allow about one request per second; each request covers 100 accounts.
      </p>
    </div>
    <ErrorNotice :error="error" title="Check failed" @retry="run" />
    <ErrorNotice v-if="extrasError" :error="extrasError" title="Names, scam flags and last activity are missing for some rows" @retry="run" />

    <template v-if="results.length">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            Total {{ COIN_SYMBOL }}
          </div>
          <div class="mt-0.5 font-semibold text-highlighted">
            <TokenAmount :nano="summary.total" :max-decimals="2" :symbol="''" />
          </div>
        </div>
        <div v-if="jetton" class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            Total {{ jetton.symbol }}
          </div>
          <div class="mt-0.5 font-semibold text-highlighted">
            <TokenAmount :nano="summary.jettonTotal" :decimals="jetton.decimals" :max-decimals="2" :symbol="''" />
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            Accounts checked
          </div>
          <div class="mt-0.5 font-semibold text-highlighted">
            {{ summary.checked }} <span class="text-xs font-normal text-muted">{{ summary.active }} active · {{ summary.empty }} never used</span>
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">
            Problems
          </div>
          <div class="mt-0.5 font-semibold" :class="summary.problems ? 'text-error' : 'text-highlighted'">
            {{ summary.problems }}
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-end justify-between gap-3">
        <UTabs
          v-model="filter"
          :content="false"
          :items="[{ label: `All (${results.length})`, value: 'all' }, { label: 'With balance', value: 'funded' }, { label: 'Problems', value: 'problems' }]"
          variant="link"
          size="sm"
        />
        <div class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="sort"
            :items="[{ label: 'Input order', value: 'input' }, { label: `Highest ${COIN_SYMBOL} first`, value: 'balance' }, ...(jetton ? [{ label: `Highest ${jetton.symbol} first`, value: 'jetton' }] : [])]"
            size="sm"
            class="w-48"
            aria-label="Sort"
          />
          <CsvExportButton :rows="exportRows" filename="ton-balances" />
        </div>
      </div>

      <UTable :data="shown" :columns="columns" class="max-h-[36rem]" sticky :ui="{ td: 'py-2 px-2 sm:px-4 align-top', th: 'py-2 px-2 sm:px-4' }">
        <template #input-cell="{ row }">
          <div class="max-w-44 whitespace-normal sm:max-w-72 sm:min-w-44">
            <div v-if="row.original.label || row.original.state?.name" class="truncate text-sm text-highlighted">
              {{ row.original.label || row.original.state?.name }}
              <UBadge v-if="row.original.state?.isScam" color="error" variant="subtle" size="sm" label="Scam" />
            </div>
            <AddressLink v-if="row.original.raw && row.original.state" :address="friendly(row.original.raw, { wallet: row.original.state.isWallet || row.original.state.status !== 'active', testnet: isTestnet })" no-links />
            <span v-else class="font-mono text-xs break-all text-muted">{{ row.original.input }}</span>
            <div v-if="row.original.raw && row.original.input.includes('.')" class="text-xs text-dimmed">
              {{ row.original.input }}
            </div>
            <div class="mt-0.5">
              <UBadge v-if="row.original.status === 'ok' && row.original.state" :color="STATUS_INFO[row.original.state.status].color" variant="subtle" size="sm" :label="row.original.state.status === 'active' ? row.original.state.kind : STATUS_INFO[row.original.state.status].label" />
              <UBadge v-else-if="row.original.status !== 'ok'" :color="PROBLEM[row.original.status].color" variant="subtle" size="sm" :label="PROBLEM[row.original.status].label" />
              <div v-if="row.original.note" class="text-xs text-muted">
                {{ row.original.note }}
              </div>
            </div>
          </div>
        </template>
        <template #balance-cell="{ row }">
          <TokenAmount v-if="row.original.state" :nano="row.original.state.balance" :symbol="''" :max-decimals="4" />
          <div v-if="jetton && row.original.jetton !== undefined" class="text-xs text-muted sm:hidden">
            <TokenAmount :nano="row.original.jetton" :decimals="jetton.decimals" :symbol="jetton.symbol" :max-decimals="2" />
          </div>
        </template>
        <template #jetton-cell="{ row }">
          <TokenAmount v-if="row.original.jetton !== undefined && jetton" :nano="row.original.jetton" :decimals="jetton.decimals" :symbol="''" :max-decimals="4" />
        </template>
        <template #activity-cell="{ row }">
          <span class="text-sm whitespace-nowrap" :title="formatUtc(row.original.state?.lastActivity)">{{ row.original.state ? timeAgo(row.original.state.lastActivity) : '' }}</span>
        </template>
        <template #empty>
          <span class="text-sm text-muted">Nothing to show for this filter.</span>
        </template>
      </UTable>
      <p v-if="filtered.length > SHOW" class="text-xs text-dimmed">
        Showing the first {{ SHOW }} of {{ filtered.length }} rows. Export CSV to get all of them.
      </p>
      <p class="text-xs text-dimmed">
        Balances come from toncenter (exact), names, scam flags and last activity from tonapi. {{ COIN_RENAME_NOTE }}
      </p>
    </template>
  </div>
</template>
