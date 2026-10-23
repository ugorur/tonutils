<script setup lang="ts">
import type { DecodedBody } from '~/lib/payloads/decode'
import type { V3Transaction } from './logic'
import DecodedTree from '~/lib/payloads/DecodedTree.vue'
import { txHashHex } from '~/utils/ton/explorers'
import { analyzeInput, plain, txMessages } from './logic'
import * as V from './vectors'

const EXAMPLES = [
  { label: 'Jetton transfer', value: V.JETTON_TRANSFER },
  { label: 'W5 wallet transfer', value: V.W5_EXTERNAL },
  { label: 'Gasless W5 (2 jetton transfers)', value: V.W5_INTERNAL },
  { label: 'Wallet v4 swap', value: V.WALLET_V4_EXTERNAL },
  { label: 'Highload v3', value: V.HIGHLOAD_EXTERNAL },
  { label: 'Bounced', value: V.BOUNCED },
  { label: 'STON.fi swap', value: V.STONFI_SWAP_V2 },
  { label: 'Full message', value: V.EXT_MESSAGE },
  { label: 'Transaction hash', value: V.JETTON_TX_HASH }
]

const input = ref('')
const { network, isTestnet } = useTonNetwork()
const toncenter = useToncenter(network)

const result = computed(() => {
  try {
    return { ok: true as const, data: analyzeInput(input.value, { testOnly: isTestnet.value }) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const analysis = computed(() => (result.value.ok ? result.value.data : null))

/** The decoded body to show (body input, or the body of a full message). */
const top = computed<DecodedBody | null>(() => {
  const a = analysis.value
  if (a?.kind === 'body') return a.body
  if (a?.kind === 'message') return { op: null, opHex: null, name: 'message', title: a.message.title, fields: a.message.fields }
  return null
})
const json = computed(() => (top.value ? plain(top.value) : null))

// ---- second opinion from toncenter /api/v3/decode for bodies we could not decode
const unknownBoc = computed(() => {
  const a = analysis.value
  const b = a?.kind === 'body' ? a.body : a?.kind === 'message' ? (a.message.fields.body as DecodedBody) : null
  return b && typeof b.fields.boc === 'string' ? b.fields.boc : null
})
const remote = ref<unknown>(null)
const remoteLoading = ref(false)
const remoteError = ref<unknown>(null)

async function askToncenter() {
  if (!unknownBoc.value) return
  remoteLoading.value = true
  remoteError.value = null
  try {
    const res = await rateLimitedJson<{ bodies: unknown[] }>(buildUrl(`${toncenter.baseUrl()}/v3`, 'decode'), { provider: 'toncenter' }, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bodies: [unknownBoc.value] })
    })
    remote.value = res.bodies?.[0] ?? null
  }
  catch (e) {
    remoteError.value = e
  }
  finally {
    remoteLoading.value = false
  }
}

// ---- transaction hash path
const tx = ref<V3Transaction | null>(null)
const txLoading = ref(false)
const txError = ref<unknown>(null)
const txNotFound = ref(false)
/** The hash was a message hash: the transaction that received it was found instead. */
const viaMessage = ref(false)
const txHash = computed(() => (analysis.value?.kind === 'hash' ? analysis.value.hash : null))
const messages = computed(() => (tx.value ? txMessages(tx.value, { testOnly: isTestnet.value }) : []))

async function loadTx() {
  const hash = txHash.value
  if (!hash) return
  txLoading.value = true
  txError.value = null
  txNotFound.value = false
  viaMessage.value = false
  tx.value = null
  try {
    let found = (await toncenter.v3<{ transactions: V3Transaction[] }>('transactions', { hash })).transactions?.[0] ?? null
    if (!found && hash === txHash.value) {
      // Explorers and TonConnect often hand out message hashes: try the transaction that received it.
      found = (await toncenter.v3<{ transactions: V3Transaction[] }>('transactionsByMessage', { msg_hash: hash, direction: 'in', limit: 1 })).transactions?.[0] ?? null
      viaMessage.value = !!found
    }
    if (hash !== txHash.value) return
    tx.value = found
    txNotFound.value = !found
  }
  catch (e) {
    txError.value = e
  }
  finally {
    txLoading.value = false
  }
}

watch([txHash, network], loadTx)
watch(input, () => {
  remote.value = null
  remoteError.value = null
})
</script>

<template>
  <div class="space-y-6">
    <BocInput
      v-model="input"
      label="Message body, full message or transaction hash"
      hint="BOC as base64 (te6cc…) or hex, or a transaction or message hash"
      :examples="EXAMPLES"
    />

    <UAlert v-if="!result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <!-- body or full message -->
    <template v-if="top">
      <KeyValue
        v-if="analysis?.kind === 'message'"
        :items="[{ label: 'Message hash', value: analysis.message.hash, hint: 'Hash of the whole message cell, as explorers show it.' }]"
      />
      <KeyValue
        v-else-if="analysis?.kind === 'body'"
        :items="[{ label: 'Body cell hash', value: analysis.hash }]"
      />

      <div class="rounded-lg border border-default p-4">
        <DecodedTree :body="top" />
      </div>

      <div v-if="unknownBoc" class="space-y-3 rounded-lg border border-dashed border-accented p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="max-w-prose text-sm text-muted">
            We could not decode every field of this body locally. toncenter knows a few hundred more contract schemas (DEXes, games, bridges).
            Asking sends only this body to toncenter.com.
          </p>
          <UButton :loading="remoteLoading" label="Ask toncenter" icon="i-lucide-radio-tower" size="sm" variant="soft" @click="askToncenter" />
        </div>
        <ErrorNotice v-if="remoteError" :error="remoteError" @retry="askToncenter" />
        <JsonView v-else-if="remote" :value="remote" label="toncenter /api/v3/decode" />
      </div>

      <UCollapsible>
        <UButton label="Show as JSON" icon="i-lucide-braces" variant="link" color="neutral" size="sm" class="px-0" trailing-icon="i-lucide-chevron-down" />
        <template #content>
          <JsonView class="mt-2" :value="json" label="Decoded (JSON)" />
        </template>
      </UCollapsible>
    </template>

    <!-- transaction hash -->
    <template v-if="txHash">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-muted">
          {{ viaMessage ? 'Transaction that received message' : 'Transaction' }} <code class="font-mono text-xs break-all">{{ txHash }}</code> on {{ network }}
        </p>
        <UButton v-if="!txLoading" label="Reload" icon="i-lucide-refresh-cw" size="xs" variant="ghost" color="neutral" @click="loadTx" />
      </div>
      <LoadingState v-if="txLoading" label="Fetching the transaction from toncenter…" />
      <ErrorNotice v-else-if="txError" :error="txError" @retry="loadTx" />
      <UAlert
        v-else-if="txNotFound"
        color="warning"
        variant="subtle"
        icon="i-lucide-search-x"
        title="Transaction not found"
        :description="`toncenter has no transaction or message with this hash on ${network}. Check the network switch in the header, or wait a few seconds if it was just sent.`"
      />
      <template v-else-if="tx">
        <ExplorerLinks kind="tx" :value="txHashHex(tx.hash)" :network="network" />
        <ol class="space-y-4">
          <li v-for="(m, i) in messages" :key="i" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="m.direction === 'in' ? 'Incoming' : `Outgoing #${i + (tx.in_msg ? 0 : 1)}`" :color="m.direction === 'in' ? 'primary' : 'neutral'" variant="subtle" />
              <UBadge v-if="m.bounced" label="Bounced" color="warning" variant="subtle" icon="i-lucide-undo-2" />
              <span v-if="m.value !== null" class="font-mono text-sm"><TokenAmount :nano="m.value" /></span>
            </div>
            <div class="grid gap-2 text-sm sm:grid-cols-2">
              <div class="min-w-0">
                <div class="text-xs text-muted">
                  From
                </div>
                <AddressLink v-if="m.from" :address="m.from" />
                <span v-else class="text-muted">external (signed by a wallet)</span>
              </div>
              <div class="min-w-0">
                <div class="text-xs text-muted">
                  To
                </div>
                <AddressLink v-if="m.to" :address="m.to" />
                <span v-else class="text-muted">external (log)</span>
              </div>
            </div>
            <DecodedTree :body="m.body" />
          </li>
        </ol>
      </template>
    </template>

    <p v-if="analysis?.kind === 'empty'" class="text-sm text-muted">
      Paste a body from an explorer, a TonConnect request or your code, or try one of the real mainnet examples above.
      Nothing is sent anywhere unless you look up a transaction hash or press "Ask toncenter".
    </p>
  </div>
</template>
