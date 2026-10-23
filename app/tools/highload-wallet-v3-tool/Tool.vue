<script setup lang="ts">
import type { Address } from '@ton/core'
import { Cell } from '@ton/core'
import { signVerify } from '@ton/crypto'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { HighloadV3State } from '~/lib/wallet-detection/state'
import { highloadProcessed, parseHighloadV3Data } from '~/lib/wallet-detection/state'
import { detectWalletVersion } from '~/utils/ton/wallets'
import type { QueryId } from './logic'
import { buildMsgInner, fromQueryId, fromSeqno, fromShiftAndBit, highloadV3Address, highloadV3Init, MAX_BATCH, MAX_BIT_NUMBER, MAX_SHIFT, MAX_TIMEOUT, nextQueryId, packTransfers, parseBatch, parseSignature, parsePublicKey, signedExternal, summarize } from './logic'

// Live mainnet highload v3 wallet (toncenter /api/v3/account): key, subwallet and timeout read from its data.
const EXAMPLE = {
  address: 'EQDy3BhgaGzWWJh-K-2CFlMtjABEYNreqQfMfUrXI2xJa81w',
  publicKey: 'cde88eba24138b75bb2745563950b974fed59adee5d5532dd7b98787e95b8ee5',
  subwalletId: '4269',
  timeout: '7200'
}

const tab = ref('address')
const tabs = [
  { label: 'Address', value: 'address' },
  { label: 'Query id', value: 'query' },
  { label: 'Check id', value: 'check' },
  { label: 'Batch', value: 'batch' }
]

const { network, isTestnet } = useTonNetwork()

// ---------------------------------------------------------------- address
const pk = ref('')
const sub = ref('4269')
const timeout = ref('3600')
const workchain = ref(0)
const addr = computed(() => {
  if (!pk.value.trim()) return null
  try {
    const a = highloadV3Address({ publicKey: pk.value, subwalletId: sub.value, timeout: timeout.value, workchain: workchain.value })
    return { ok: true as const, bounceable: a.toString({ testOnly: isTestnet.value }), raw: a.toRawString() }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

// ---------------------------------------------------------------- query id
const qMode = ref<'id' | 'pair' | 'seq'>('id')
const qId = ref('418093')
const qShift = ref('408')
const qBit = ref('301')
const qSeq = ref('')
const query = computed(() => {
  try {
    if (qMode.value === 'pair') return { ok: true as const, q: fromShiftAndBit(qShift.value, qBit.value) }
    if (qMode.value === 'seq') return qSeq.value.trim() ? { ok: true as const, q: fromSeqno(qSeq.value) } : null
    return qId.value.trim() ? { ok: true as const, q: fromQueryId(qId.value) } : null
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const qRows = computed<KeyValueItem[]>(() => {
  if (!query.value?.ok) return []
  const q = query.value.q
  const next = nextQueryId(q)
  return [
    { label: 'Query id', value: String(q.queryId), hint: `0x${q.queryId.toString(16)}: what you put in the message (uint23)` },
    { label: 'Shift', value: String(q.shift), hint: 'query_id >> 10 (0 to 8191): which bitmap cell' },
    { label: 'Bit number', value: String(q.bitNumber), hint: 'query_id & 1023 (0 to 1022): which bit in that cell' },
    { label: 'Sequence number', value: String(q.seqno), hint: 'shift × 1023 + bit: the order HighloadQueryId.getNext() walks' },
    { label: 'Next id', value: next ? String(next.queryId) : 'None', hint: next ? `shift ${next.shift}, bit ${next.bitNumber}` : 'The wrapper keeps the last id for an emergency withdrawal' }
  ]
})

// ---------------------------------------------------------------- on-chain check
const tc = useToncenter()
const chkAddr = ref('')
const chkParsed = ref<Address | null>(null)
const chkQuery = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const state = shallowRef<{ st: HighloadV3State, balance: string, address: string, at: number } | null>(null)

async function load() {
  if (!chkParsed.value) return
  error.value = null
  state.value = null
  loading.value = true
  try {
    const acc = await tc.v3<{ balance: string, code: string | null, data: string | null, status: string }>('account', { address: chkParsed.value.toRawString() })
    if (!acc.code || !acc.data) throw new Error(`This account is ${acc.status === 'uninit' ? 'not deployed yet' : acc.status}: there is no wallet state to read.`)
    const kind = detectWalletVersion(Cell.fromBase64(acc.code).hash().toString('hex'))
    if (kind?.version !== 'highload-v3') throw new Error(`This is not a highload wallet v3 (detected: ${kind?.label ?? 'unknown contract'}). The Wallet version detector reads other wallets.`)
    const st = parseHighloadV3Data(Cell.fromBase64(acc.data))
    state.value = { st, balance: acc.balance, address: chkParsed.value.toString({ testOnly: isTestnet.value }), at: Math.floor(Date.now() / 1000) }
    const s = summarize(st)
    if (!chkQuery.value.trim() && s.highest !== null) chkQuery.value = String(s.highest)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}
watch(network, () => {
  if (state.value) load()
})

const stRows = computed<KeyValueItem[]>(() => {
  const v = state.value
  if (!v) return []
  const s = summarize(v.st)
  const fmt = (t: number) => (t ? new Date(t * 1000).toLocaleString() : 'Never')
  return [
    { label: 'Public key', value: v.st.publicKey },
    { label: 'Subwallet id', value: String(v.st.subwalletId) },
    { label: 'Timeout', value: `${v.st.timeout} s`, hint: 'External messages expire after this; a query id is remembered for between 1× and 2× timeout', mono: false },
    { label: 'Last clean', value: fmt(v.st.lastCleanTime), mono: false },
    { label: 'Ids in current window', value: String(s.current), mono: false },
    { label: 'Ids in previous window', value: String(s.previous), mono: false },
    { label: 'Highest id seen', value: s.highest === null ? 'None' : String(s.highest) }
  ]
})

const check = computed<{ q: QueryId, processed: boolean, cleaned: boolean } | { error: string } | null>(() => {
  const v = state.value
  if (!v || !chkQuery.value.trim()) return null
  try {
    const q = fromQueryId(chkQuery.value)
    const processed = highloadProcessed(v.st, q.queryId, v.at)
    return { q, processed, cleaned: !processed && highloadProcessed(v.st, q.queryId) }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})

// ---------------------------------------------------------------- batch (unsigned msg_inner; you sign elsewhere)
const bText = ref('')
const bQuery = ref('0')
const bCreatedAt = ref(String(Math.floor(Date.now() / 1000) - 30))
const bDeploy = ref(false)
const bSig = ref('')
const batch = computed(() => {
  if (!bText.value.trim()) return null
  if (!addr.value?.ok) return { error: 'Fill in the public key, subwallet id and timeout on the Address tab first: they define the wallet.' }
  try {
    const { transfers, errors } = parseBatch(bText.value, s => parseUnits(s))
    if (errors.length) return { error: errors.slice(0, 3).join(' · ') + (errors.length > 3 ? ` (+${errors.length - 3} more)` : '') }
    const wallet = highloadV3Address({ publicKey: pk.value, subwalletId: sub.value, timeout: timeout.value, workchain: workchain.value })
    const inner = buildMsgInner(packTransfers(wallet, transfers, Number(fromQueryId(bQuery.value).queryId)), {
      subwalletId: Number(sub.value), queryId: fromQueryId(bQuery.value).queryId, createdAt: Number(bCreatedAt.value), timeout: Number(timeout.value)
    })
    const total = transfers.reduce((n, t) => n + t.amount, 0n)
    return { wallet, inner, count: transfers.length, hops: Math.ceil(Math.max(transfers.length - 1, 1) / 253), total }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})
const signed = computed(() => {
  const b = batch.value
  if (!b || 'error' in b || !bSig.value.trim()) return null
  try {
    const sig = parseSignature(bSig.value)
    if (!signVerify(b.inner.hash(), sig, parsePublicKey(pk.value))) return { error: 'This signature does not match the msg_inner hash and public key above.' }
    const init = bDeploy.value ? highloadV3Init({ publicKey: pk.value, subwalletId: sub.value, timeout: timeout.value }) : undefined
    return { boc: signedExternal(b.wallet, b.inner, sig, init).toBoc().toString('base64') }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})
function batchExample() {
  example()
  bText.value = 'EQDy3BhgaGzWWJh-K-2CFlMtjABEYNreqQfMfUrXI2xJa81w, 0.05, payout #1\nUQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI, 0.1'
}

function example() {
  pk.value = EXAMPLE.publicKey
  sub.value = EXAMPLE.subwalletId
  timeout.value = EXAMPLE.timeout
  workchain.value = 0
}
function exampleCheck() {
  chkAddr.value = EXAMPLE.address
  chkQuery.value = ''
  nextTick(load)
}
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" />

    <!-- address -->
    <div v-if="tab === 'address'" class="space-y-4">
      <p class="text-sm text-muted">
        A highload v3 address depends on three values in its initial data: the public key, the subwallet id and the timeout. Change any one and you get a different wallet.
      </p>
      <UFormField label="Public key" hint="64 hex or 44 base64 characters">
        <UInput v-model="pk" placeholder="cde88eba24138b75…" size="lg" class="w-full" :ui="{ base: 'font-mono text-sm' }" autocomplete="off" spellcheck="false" />
      </UFormField>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Subwallet id" hint="uint32, decimal or 0x…">
          <UInput v-model="sub" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
        </UFormField>
        <UFormField label="Timeout (seconds)" :hint="`1 to ${MAX_TIMEOUT}`">
          <UInput v-model="timeout" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
        </UFormField>
        <UFormField label="Workchain">
          <USelect v-model="workchain" :items="[{ label: 'Basechain (0)', value: 0 }, { label: 'Masterchain (-1)', value: -1 }]" class="w-full" />
        </UFormField>
      </div>
      <UButton v-if="!pk" label="Try a live mainnet wallet" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />

      <UAlert v-if="addr && !addr.ok" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="addr.error" />
      <div v-else-if="addr?.ok" class="space-y-1">
        <KeyValue
          :items="[
            { label: 'Address (bounceable)', value: addr.bounceable, hint: 'Highload wallets are contracts: send to them bounceable' },
            { label: 'Raw address', value: addr.raw }
          ]"
        />
        <ExplorerLinks :value="addr.bounceable" />
      </div>
      <p class="text-xs text-muted">
        Code: the official ton-blockchain/highload-wallet-contract-v3 build (code hash 11acad79…8525). Initial data: key, subwallet id, two empty query dictionaries, last_clean_time 0, timeout.
      </p>
    </div>

    <!-- query id -->
    <div v-else-if="tab === 'query'" class="space-y-4">
      <p class="text-sm text-muted">
        Highload v3 replaces seqno with a 23-bit query id: the top 13 bits pick a bitmap cell (shift), the low 10 bits pick a bit in it. Each id can be used once per window.
      </p>
      <URadioGroup
        v-model="qMode"
        orientation="horizontal"
        :items="[{ label: 'Query id', value: 'id' }, { label: 'Shift + bit', value: 'pair' }, { label: 'Sequence #', value: 'seq' }]"
      />
      <UFormField v-if="qMode === 'id'" label="Query id" hint="Decimal or 0x…">
        <UInput v-model="qId" class="w-full" size="lg" :ui="{ base: 'font-mono' }" inputmode="numeric" />
      </UFormField>
      <div v-else-if="qMode === 'pair'" class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Shift" :hint="`0 to ${MAX_SHIFT}`">
          <UInput v-model="qShift" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
        </UFormField>
        <UFormField label="Bit number" :hint="`0 to ${MAX_BIT_NUMBER}`">
          <UInput v-model="qBit" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
        </UFormField>
      </div>
      <UFormField v-else label="Sequence number" hint="The n-th id from HighloadQueryId (0-based)">
        <UInput v-model="qSeq" class="w-full" size="lg" :ui="{ base: 'font-mono' }" inputmode="numeric" placeholder="e.g. 1023" />
      </UFormField>
      <UAlert v-if="query && !query.ok" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="query.error" />
      <KeyValue v-else-if="qRows.length" :items="qRows" />
    </div>

    <!-- check -->
    <div v-else-if="tab === 'check'" class="space-y-4">
      <p class="text-sm text-muted">
        Reads the wallet's current state and answers like its <code class="font-mono">processed?(query_id, true)</code> get-method: was this query id already used, so a retry would be rejected?
      </p>
      <form class="space-y-3" @submit.prevent="load">
        <AddressInput v-model="chkAddr" label="Highload v3 wallet address" @parsed="a => (chkParsed = a)" />
        <UButton type="submit" label="Read state" icon="i-lucide-radar" :loading="loading" :disabled="!chkParsed" />
        <UButton v-if="!chkAddr" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="ml-2 px-0" @click="exampleCheck" />
      </form>

      <LoadingState v-if="loading" label="Reading the wallet from toncenter…" />
      <ErrorNotice :error="error" @retry="load" />

      <template v-if="state && !loading">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <AddressLink :address="state.address" />
          <TokenAmount :nano="state.balance" class="text-highlighted" />
        </div>
        <KeyValue :items="stRows" />

        <UFormField label="Query id to check" hint="Decimal or 0x…">
          <UInput v-model="chkQuery" class="w-full" size="lg" :ui="{ base: 'font-mono' }" inputmode="numeric" />
        </UFormField>
        <UAlert v-if="check && 'error' in check" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="check.error" />
        <UAlert
          v-else-if="check"
          :color="check.processed ? 'warning' : 'success'"
          variant="subtle"
          :icon="check.processed ? 'i-lucide-circle-check-big' : 'i-lucide-circle'"
          :title="check.processed ? `Query id ${check.q.queryId} is processed` : `Query id ${check.q.queryId} is not marked as processed`"
          :description="check.processed
            ? 'The wallet already accepted a message with this id. Sending it again is rejected until the id is cleaned out after 2× timeout.'
            : check.cleaned
              ? 'It was used, but it sits in a window the next message will clean, so it no longer protects against replay.'
              : 'No message with this id is remembered: either it was never sent, it is still pending, or it was cleaned after 2× timeout.'"
        />
        <p class="text-xs text-muted">
          State read {{ new Date(state.at * 1000).toLocaleTimeString() }}, shift {{ check && 'q' in check ? check.q.shift : '…' }}, bit {{ check && 'q' in check ? check.q.bitNumber : '…' }}. Read again to refresh.
        </p>
      </template>
    </div>

    <!-- batch -->
    <div v-if="tab === 'batch'" class="space-y-4">
      <p class="text-sm text-muted">
        Builds the unsigned <code class="font-mono">msg_inner</code> for one external message that pays everyone in the list: up to 254 transfers per internal batch, longer lists chain batches (same layout as the official wrapper's <code class="font-mono">sendBatch</code>). Sign its hash with the wallet key on your own machine, paste the signature, and broadcast the result. This site never asks for the key.
      </p>
      <UAlert v-if="!addr?.ok" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Set the wallet on the Address tab first" description="The public key, subwallet id and timeout there define which wallet sends the batch." />
      <UFormField :label="`Transfers (max ${MAX_BATCH})`" :hint="`address, amount in ${COIN_SYMBOL}, optional comment: one per line`">
        <UTextarea v-model="bText" :rows="6" class="w-full" :ui="{ base: 'font-mono text-sm' }" placeholder="UQ…, 1.5, invoice 42" spellcheck="false" />
      </UFormField>
      <UButton v-if="!bText" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="batchExample" />
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Query id" hint="Unused id; see the Query id tab">
          <UInput v-model="bQuery" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
        </UFormField>
        <UFormField label="created_at (unix seconds)" :hint="`Must be within the last ${timeout || '…'} s when it lands`">
          <UInput v-model="bCreatedAt" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric">
            <template #trailing>
              <UButton label="Now" size="xs" variant="ghost" @click="bCreatedAt = String(Math.floor(Date.now() / 1000) - 30)" />
            </template>
          </UInput>
        </UFormField>
      </div>
      <UAlert v-if="batch && 'error' in batch" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="batch.error" />
      <template v-else-if="batch">
        <KeyValue
          :items="[
            { label: 'Transfers', value: `${batch.count} in ${batch.hops} internal batch${batch.hops > 1 ? 'es' : ''}`, mono: false, copy: false },
            { label: 'Total sent', value: formatCoin(batch.total), copy: false, hint: 'Plus forwarding and gas fees, paid from the wallet balance' },
            { label: 'msg_inner hash (sign this)', value: batch.inner.hash().toString('hex'), hint: 'Ed25519-sign these 32 bytes with the wallet secret key' },
            { label: 'msg_inner BOC', value: batch.inner.toBoc().toString('base64') }
          ]"
        />
        <UFormField label="Signature" hint="128 hex or 88 base64 characters">
          <UInput v-model="bSig" class="w-full" :ui="{ base: 'font-mono text-sm' }" autocomplete="off" spellcheck="false" />
        </UFormField>
        <UCheckbox v-model="bDeploy" label="Include the StateInit (first message from a wallet that is not deployed yet)" />
        <UAlert v-if="signed && 'error' in signed" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="signed.error" />
        <div v-else-if="signed" class="space-y-2">
          <ResultField label="Signed external message (BOC)" :value="signed.boc" />
          <UButton to="/tools/external-message-builder-sender" label="Broadcast it with the external message sender" icon="i-lucide-send" variant="soft" size="sm" />
        </div>
      </template>
    </div>

    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Sending batches"
      description="Highload v3 only accepts external messages signed with its private key, which this site never asks for. The Batch tab builds the unsigned message for up to 254 transfers per batch so you can sign it on your own machine."
    />
  </div>
</template>
