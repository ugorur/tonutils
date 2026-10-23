<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { CodeInfo, AccountReport } from './logic'
import { classifyInput, codeHashTable, inspectAccount, inspectCode, inspectHash } from './logic'

const EXAMPLES = [
  { label: 'W5 wallet', value: 'UQBNptKtYdpPkOMZCVglVWaQ0PwwNHDxkYb6NvIyDcUTgcrl' },
  { label: 'v3R2 (TON Foundation)', value: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N' },
  { label: 'Highload v3', value: 'EQDy3BhgaGzWWJh-K-2CFlMtjABEYNreqQfMfUrXI2xJa81w' },
  { label: 'Code hash', value: 'IINLe3KxEhR+Gy+0V7hOdNGjDwT3N9T2KmaOlVLSty8=' }
]

// Contract kinds that have a dedicated viewer on this site.
const VIEWERS: Record<string, { to: string, label: string }> = {
  'multisig-v2': { to: '/tools/multisig-viewer', label: 'Open in multisig viewer' },
  'vesting': { to: '/tools/vesting-viewer', label: 'Open in vesting viewer' },
  'highload-v3': { to: '/tools/highload-wallet-v3-tool', label: 'Open in highload v3 helper' }
}

const input = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const result = ref<{ source: 'address', address: string, bounceable: boolean, status: string, balance: string, report: AccountReport | null } | { source: 'code', report: CodeInfo } | null>(null)

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()

async function run() {
  error.value = null
  result.value = null
  let parsed
  try {
    parsed = classifyInput(input.value)
  }
  catch (e) {
    error.value = e
    return
  }
  if (parsed.kind === 'hash') return void (result.value = { source: 'code', report: inspectHash(parsed.hashHex) })
  if (parsed.kind === 'code') return void (result.value = { source: 'code', report: inspectCode(parsed.code) })

  loading.value = true
  try {
    const a = parsed.address
    const acc = await tc.v3<{ balance: string, code: string | null, data: string | null, status: string }>('account', { address: a.toRawString() })
    const report = acc.code ? inspectAccount(acc.code, acc.data, { workchain: a.workChain, testOnly: isTestnet.value }) : null
    // Plain wallets (v1–W5) and undeployed accounts take the non-bounceable form; other contracts the bounceable one.
    const bounceable = !!report && !/^v\d/.test(report.wallet?.version ?? '')
    result.value = { source: 'address', address: a.toString({ bounceable, testOnly: isTestnet.value }), bounceable, status: acc.status, balance: acc.balance, report }
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
  run()
}

// Changing network invalidates an address lookup.
watch(network, () => {
  if (result.value?.source === 'address') run()
})

const report = computed(() => result.value?.report ?? null)
const codeRows = computed<KeyValueItem[]>(() => {
  const r = report.value
  if (!r) return []
  const rows: KeyValueItem[] = [
    { label: 'Code hash (hex)', value: r.hashHex },
    { label: 'Code hash (base64)', value: r.hashBase64, hint: 'The form toncenter and tonapi return as code_hash' }
  ]
  if (r.libraryHashHex) rows.push({ label: 'Library hash', value: r.libraryHashHex, hint: 'The code is a library cell: the account stores only this hash and runs the shared library from the masterchain.' })
  return rows
})
const dataRows = computed<KeyValueItem[]>(() => {
  const r = result.value?.source === 'address' ? result.value.report : null
  return (r?.data?.fields ?? []).map(f => ({ label: f.label, value: f.value, hint: f.hint, mono: f.mono ?? true, copy: f.mono ?? true }))
})
const dataError = computed(() => (result.value?.source === 'address' ? result.value.report?.dataError : null))
const viewer = computed(() => (report.value?.wallet ? VIEWERS[report.value.wallet.version] : undefined))
const table = codeHashTable()
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Address, code hash or code BOC" hint="Hash: 64 hex or 44 base64 characters">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="input"
            placeholder="UQ…, EQ…, 0:…, a code hash or te6cc…"
            size="lg"
            class="w-full"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" label="Detect" icon="i-lucide-scan-search" size="lg" :loading="loading" :disabled="!input.trim()" class="justify-center" />
        </div>
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" label="Reading the account from toncenter…" />
    <ErrorNotice :error="error" @retry="run" />

    <template v-if="result && !loading">
      <div v-if="result.source === 'address'" class="space-y-1">
        <AddressLink :address="result.address" :bounceable="result.bounceable" full />
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>Status: <span class="text-highlighted">{{ result.status }}</span></span>
          <span>Balance: <TokenAmount :nano="result.balance" class="text-highlighted" /></span>
        </div>
      </div>

      <UAlert
        v-if="result.source === 'address' && !result.report"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-dashed"
        title="No contract code on this address yet"
        :description="result.status === 'frozen' ? 'The account is frozen: its code was removed for unpaid storage fees.' : 'The wallet was never deployed (it deploys with its first outgoing transfer), so its version cannot be read from the chain. If you know its public key, Find my other wallet versions shows which version this address belongs to.'"
      />

      <template v-if="report">
        <div class="flex flex-wrap items-center gap-3">
          <UBadge
            :color="report.wallet ? 'primary' : 'neutral'"
            variant="subtle"
            size="lg"
            :icon="report.wallet ? 'i-lucide-badge-check' : 'i-lucide-help-circle'"
            :label="report.wallet ? report.wallet.label : 'Not a known wallet contract'"
          />
          <UButton v-if="viewer" :to="viewer.to" :label="viewer.label" variant="link" trailing-icon="i-lucide-arrow-right" class="px-0" />
        </div>
        <p v-if="!report.wallet" class="text-sm text-muted">
          This code hash is not one of the wallet contracts below. It may be another smart contract (jetton wallet, NFT, DEX pool…) or a custom wallet.
        </p>

        <div v-if="dataRows.length">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Wallet data
          </h3>
          <KeyValue :items="dataRows" class="whitespace-pre-line" />
        </div>
        <UAlert v-if="dataError" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Could not parse the data" :description="dataError" />

        <div>
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Code
          </h3>
          <KeyValue :items="codeRows" />
        </div>
      </template>
    </template>

    <details class="group rounded-md border border-default">
      <summary class="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-highlighted">
        Known wallet code hashes ({{ table.length }})
        <UIcon name="i-lucide-chevron-down" class="size-4 transition group-open:rotate-180" />
      </summary>
      <div class="divide-y divide-default border-t border-default">
        <div v-for="row in table" :key="row.base64" class="flex items-start gap-3 px-4 py-2.5">
          <div class="min-w-0 flex-1">
            <div class="text-sm text-highlighted">
              {{ row.label }}
            </div>
            <div class="font-mono text-xs break-all text-muted">
              {{ row.hex }}
            </div>
            <div class="font-mono text-xs break-all text-dimmed">
              {{ row.base64 }}
            </div>
          </div>
          <CopyButton :value="row.hex" size="xs" />
        </div>
      </div>
      <p class="border-t border-default px-4 py-3 text-xs text-muted">
        Hashes checked against live mainnet accounts. W5 beta accounts store a library cell, so its entry is the library cell hash. Highload v2 has two code variants.
      </p>
    </details>
  </div>
</template>
