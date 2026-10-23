<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { AccountSnapshot } from '~/lib/accounts-history/state'
import { parseShardAccount } from '~/lib/accounts-history/state'
import { loadSandbox } from '~/utils/lazy'
import type { DryRun, FreezeInfo, Recovered, StoragePrices } from './logic'
import {
  checkStateInit, fetchStoragePrices, findFreeze, GAS_RESERVE, MAX_STATE_INIT_BYTES, parseManualState, readDryRun, recoverAt,
  unfreezeCost, unfreezeDestination, unfreezeMessage
} from './logic'

// A real masterchain Wallet v3R2 frozen since 2022 with ~98.9 GRAM on it (from TON Core's frozen-accounts list).
const EXAMPLE = '-1:E250F65D28B382AEA70DA43B8518D1268AE070301D7C4C15CD8C38A67B0A4313'
const ZERO_SENDER = '0:0000000000000000000000000000000000000000000000000000000000000000'

const route = useRoute()
const tc = useToncenter()
const ton = useTonConnect()
const { network, isTestnet } = useTonNetwork()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)

const checking = ref(false)
const progress = ref('')
const error = ref<unknown>(null)
const account = shallowRef<{ address: string, boc: string, state: AccountSnapshot } | null>(null)
const freeze = shallowRef<FreezeInfo | null>(null)
const searched = ref(false)
const recovered = shallowRef<Recovered | null>(null)
const prices = shallowRef<StoragePrices | null>(null)
let session = 0

function reset() {
  session++
  account.value = null
  freeze.value = null
  searched.value = false
  recovered.value = null
  dry.value = null
  dryError.value = null
  sent.value = null
  sendError.value = null
  confirmed.value = false
  error.value = null
}

async function check() {
  if (!parsed.value) return
  reset()
  const my = session
  const address = parsed.value.toRawString()
  checking.value = true
  const step = (t: string) => {
    if (my === session) progress.value = t
  }
  try {
    step('Reading the account…')
    const r = await tc.v2<{ bytes: string }>('getShardAccountCell', { address })
    if (my !== session) return
    const state = parseShardAccount(r.bytes)
    account.value = { address, boc: r.bytes, state }
    if (state.status !== 'frozen') return
    prices.value ??= await fetchStoragePrices(tc.v2)
    const f = await findFreeze(tc.v3, address, state.stateHash!, step)
    if (my !== session) return
    freeze.value = f
    searched.value = true
    if (f) {
      step('Reading the state from just before the freeze (archive)…')
      const rec = await recoverAt(tc.v2, address, f.stateBlock, state.stateHash!)
      if (my === session) recovered.value = rec
    }
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) checking.value = false
  }
}

function example() {
  input.value = EXAMPLE
  nextTick(check)
}

watch(network, () => {
  prices.value = null // storage prices (config 18) differ per network
  reset()
})
onMounted(() => {
  if (input.value) nextTick(check)
})

// ---------------------------------------------------------------- manual fallback
const manual = reactive({ seqno: '', stateInit: '', code: '', data: '' })
const manualError = ref<unknown>(null)
const manualBusy = ref(false)
async function useManual() {
  const a = account.value
  if (!a?.state.stateHash) return
  manualError.value = null
  manualBusy.value = true
  try {
    if (manual.seqno.trim()) {
      const r = await recoverAt(tc.v2, a.address, Number(manual.seqno.trim()), a.state.stateHash)
      if (!r) throw new Error('The account was not active at that block. Pick a block before it was frozen.')
      recovered.value = r
    }
    else {
      recovered.value = checkStateInit(parseManualState(manual.stateInit, manual.code, manual.data), a.state.stateHash)
    }
    dry.value = null
  }
  catch (e) {
    manualError.value = e
  }
  finally {
    manualBusy.value = false
  }
}

// ---------------------------------------------------------------- cost
const MONTHS = [0, 1, 6, 12, 24].map(m => ({ label: m ? `${m} month${m > 1 ? 's' : ''}` : 'None', value: m }))
const months = ref(12)
const masterchain = computed(() => account.value?.address.startsWith('-1:') ?? false)
const cost = computed(() => (account.value && recovered.value && prices.value
  ? unfreezeCost(account.value.state, recovered.value.cell, prices.value, { masterchain: masterchain.value, months: months.value })
  : null))
const tooBig = computed(() => (recovered.value?.bytes ?? 0) > MAX_STATE_INIT_BYTES)
const ready = computed(() => !!recovered.value?.matches && !tooBig.value && !!cost.value)
const destination = computed(() => (account.value ? unfreezeDestination(account.value.address, isTestnet.value) : ''))
const messages = computed<TonConnectMessage[]>(() => (ready.value
  ? [{ address: destination.value, amount: cost.value!.amount, stateInit: recovered.value!.cell }]
  : []))

// ---------------------------------------------------------------- dry run
const dry = shallowRef<DryRun | null>(null)
const dryError = ref<unknown>(null)
const dryBusy = ref(false)
async function dryRun() {
  const a = account.value
  if (!a || !ready.value) return
  dryBusy.value = true
  dryError.value = null
  dry.value = null
  try {
    const now = Math.floor(Date.now() / 1000)
    const from = ton.wallet.value?.address ?? ZERO_SENDER
    const msg = unfreezeMessage(from, destination.value, cost.value!.amount, recovered.value!.stateInit, now)
    const sb = await loadSandbox()
    const res = await sb.runTransaction({
      shardAccount: a.boc,
      message: msg.toBoc().toString('base64'),
      now,
      lt: (BigInt(a.state.lastTxLt) + 1_000_000n).toString()
    })
    dry.value = readDryRun(res as Parameters<typeof readDryRun>[0])
  }
  catch (e) {
    dryError.value = e
  }
  finally {
    dryBusy.value = false
  }
}
watch([() => ready.value && recovered.value, months], ([v]) => {
  if (v) dryRun()
})

// ---------------------------------------------------------------- send
const confirmed = ref(false)
const sending = ref(false)
const sendError = ref<unknown>(null)
const sent = shallowRef<{ hash: string, trace: TonTrace | null } | null>(null)
async function send() {
  // Irreversible: only send what the emulator restored successfully.
  if (!messages.value.length || !confirmed.value || dryBusy.value || dry.value?.status !== 'active') return
  sending.value = true
  sendError.value = null
  try {
    const r = await ton.sendTransaction({ messages: messages.value })
    sent.value = { hash: r.hash, trace: null }
    const trace = await ton.waitForTransaction(r.hash)
    sent.value = { hash: r.hash, trace }
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = false
  }
}

const fmtTime = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const STATUS_TEXT: Record<AccountSnapshot['status'], string> = {
  active: 'This account is active, not frozen. Nothing to do.',
  uninit: 'This account is uninitialized: it has no code yet. If it was a contract whose state never changed, deploy it again with its original StateInit (for a wallet, simply send a transaction from it).',
  nonexist: `This account does not exist. If it was frozen with a debt above 1 ${COIN_SYMBOL} and a zero balance, the network deleted it; it can only be deployed again from its original StateInit.`,
  frozen: ''
}
const infoRows = computed<KeyValueItem[]>(() => {
  const s = account.value?.state
  if (!s || s.status !== 'frozen') return []
  return [
    { label: 'Frozen state hash', value: s.stateHash!, hint: 'Hash of the code and data the account had when it was frozen. Only a StateInit with exactly this hash can restore it.' },
    { label: 'Stored storage debt', value: formatCoin(s.storage?.duePayment ?? 0n), mono: false, copy: false },
    { label: 'Storage last paid', value: s.storage?.lastPaid ? fmtTime(s.storage.lastPaid) : '—', mono: false, copy: false }
  ]
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="check">
      <AddressInput v-model="input" label="Frozen account address" placeholder="EQ… / UQ… / 0:…" @parsed="parsed = $event" />
      <div class="flex flex-wrap items-center gap-3">
        <UButton type="submit" label="Check account" icon="i-lucide-snowflake" :loading="checking" :disabled="!parsed" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
      <p class="text-xs text-muted">
        An account is frozen when it owes more than 0.1 {{ COIN_SYMBOL }} in storage fees. Its code and data are dropped and only their hash is kept; sending that exact code and data back with enough {{ COIN_SYMBOL }} restores it.
      </p>
    </form>

    <LoadingState v-if="checking" :label="progress || 'Checking…'" />
    <ErrorNotice :error="error" title="Could not check the account" @retry="check" />

    <template v-if="account">
      <UAlert v-if="account.state.status !== 'frozen'" color="info" variant="subtle" icon="i-lucide-info" :title="`Status: ${account.state.status}`" :description="STATUS_TEXT[account.state.status]" />

      <template v-else>
        <section class="space-y-3" aria-labelledby="uf-state">
          <h3 id="uf-state" class="font-display text-sm font-semibold text-highlighted">
            1. Frozen account
          </h3>
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
            <AddressLink :address="account.address" />
            <span class="text-sm">Balance <TokenAmount :nano="account.state.balance" :max-decimals="4" /></span>
          </div>
          <KeyValue :items="infoRows" />
        </section>

        <section v-if="!checking" class="space-y-3 border-t border-default pt-5" aria-labelledby="uf-recover">
          <h3 id="uf-recover" class="font-display text-sm font-semibold text-highlighted">
            2. State before the freeze
          </h3>
          <p v-if="freeze" class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            Frozen on {{ fmtTime(freeze.freezeTx.now) }} by transaction
            <ExplorerLinks kind="tx" :value="freeze.freezeTx.hash" />
            · state read at masterchain block #{{ freeze.stateBlock }}
          </p>
          <UAlert v-else-if="searched" color="warning" variant="subtle" icon="i-lucide-search-x" title="The freeze transaction was not found" description="The indexer has no active → frozen transaction for this account. Enter a block from before the freeze or paste the StateInit below." />

          <div v-if="recovered" class="space-y-2 rounded-lg border p-4" :class="recovered.matches ? 'border-success/40' : 'border-error/40'" data-testid="uf-recovered">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="recovered.matches ? 'success' : 'error'" variant="subtle" :icon="recovered.matches ? 'i-lucide-badge-check' : 'i-lucide-circle-x'" :label="recovered.matches ? 'Hash matches the frozen hash' : 'Hash does not match'" />
              <span class="text-xs text-muted">{{ recovered.bytes.toLocaleString() }} bytes</span>
            </div>
            <ResultField label="StateInit hash" :value="recovered.hash" />
            <ResultField label="StateInit (base64 BOC)" :value="recovered.cell.toBoc().toString('base64')" class="[&_.font-mono]:max-h-28 [&_.font-mono]:overflow-auto" />
            <p v-if="!recovered.matches" class="text-sm text-error">
              This is not the state the account was frozen with, so sending it would not restore anything. Try another block or paste the right StateInit.
            </p>
            <UAlert
              v-if="tooBig"
              color="error"
              variant="subtle"
              icon="i-lucide-ban"
              title="Too large to send from a wallet"
              :description="`Wallets send through an external message, which the network caps at 64 KB. This StateInit is ${(recovered.bytes / 1024).toFixed(0)} KB. It would need a helper contract that forwards it as an internal message; this tool cannot do that.`"
            />
          </div>

          <details class="rounded-lg border border-default p-3 text-sm" :open="searched && !recovered?.matches">
            <summary class="cursor-pointer text-muted">
              Use another block or paste the StateInit yourself
            </summary>
            <form class="mt-3 space-y-3" @submit.prevent="useManual">
              <UFormField label="Masterchain block before the freeze" hint="Reads the state there from the archive">
                <UInput v-model="manual.seqno" inputmode="numeric" class="w-full sm:w-60" :ui="{ base: 'font-mono' }" />
              </UFormField>
              <UFormField label="…or StateInit BOC" hint="base64 or hex">
                <UTextarea v-model="manual.stateInit" :rows="2" class="w-full" :ui="{ base: 'font-mono text-xs' }" />
              </UFormField>
              <div class="grid gap-3 sm:grid-cols-2">
                <UFormField label="…or code BOC">
                  <UTextarea v-model="manual.code" :rows="2" class="w-full" :ui="{ base: 'font-mono text-xs' }" />
                </UFormField>
                <UFormField label="and data BOC">
                  <UTextarea v-model="manual.data" :rows="2" class="w-full" :ui="{ base: 'font-mono text-xs' }" />
                </UFormField>
              </div>
              <UButton type="submit" label="Check hash" icon="i-lucide-hash" size="sm" color="neutral" variant="outline" :loading="manualBusy" />
              <ErrorNotice :error="manualError" />
            </form>
          </details>
        </section>

        <section v-if="ready && cost" class="space-y-4 border-t border-default pt-5" aria-labelledby="uf-send">
          <h3 id="uf-send" class="font-display text-sm font-semibold text-highlighted">
            3. Send the unfreeze message
          </h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Prepay storage for" :hint="`about ${formatCoin(cost.monthlyRent, { maxDecimals: 4 })} / month`">
              <USelect v-model="months" :items="MONTHS" class="w-full" />
            </UFormField>
            <div class="text-sm">
              <div class="flex justify-between gap-2">
                <span class="text-muted">Storage debt now</span><TokenAmount :nano="cost.debt" :max-decimals="6" />
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Prepaid storage</span><TokenAmount :nano="cost.rent" :max-decimals="6" />
              </div>
              <div class="flex justify-between gap-2">
                <span class="text-muted">Already on the account</span><TokenAmount :nano="account.state.balance" :max-decimals="4" />
              </div>
              <div class="mt-1 flex justify-between gap-2 border-t border-default pt-1 font-medium">
                <span>To send (incl. {{ formatCoin(GAS_RESERVE) }} gas reserve)</span><TokenAmount :nano="cost.amount" :max-decimals="6" />
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-default p-4 text-sm" data-testid="uf-dry-run">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium text-highlighted">Dry run in a TVM emulator</span>
              <UButton label="Run again" icon="i-lucide-play" size="xs" color="neutral" variant="outline" :loading="dryBusy" @click="dryRun" />
            </div>
            <LoadingState v-if="dryBusy" label="Loading the emulator and running the unfreeze…" />
            <ErrorNotice :error="dryError" title="The dry run failed" />
            <p v-if="dryError" class="text-error">
              Sending stays disabled until the dry run succeeds.
            </p>
            <p v-if="dry && dry.status === 'active'" class="text-success">
              <UIcon name="i-lucide-badge-check" class="mr-1 inline-block size-4 align-text-bottom" />
              The account becomes active, with <TokenAmount :nano="dry.balance" :max-decimals="4" /> and no debt left{{ dry.exitCode !== null && dry.exitCode > 1 ? ` (its code exited with ${dry.exitCode} on the empty message, which does not undo the restore)` : '' }}.
            </p>
            <p v-else-if="dry" class="text-error">
              In the emulator the account stays {{ dry.status }} (exit code {{ dry.exitCode ?? '—' }}). Do not send this.
            </p>
            <p class="mt-1 text-xs text-muted">
              Runs the exact message on the account's current state, locally, with the emulator's bundled network config.
            </p>
          </div>

          <TxPreview :messages="messages" />
          <p class="text-xs text-muted">
            Sent non-bounceable ({{ destination.slice(0, 2) }}…), so the {{ COIN_SYMBOL }} pays the debt before the state is restored.
          </p>
          <WalletGate purpose="send the unfreeze message">
            <div class="space-y-4">
              <UCheckbox v-model="confirmed" :label="`I understand the ${COIN_SYMBOL} I send becomes this contract's balance and only its owner can move it.`" />
              <UButton label="Unfreeze in wallet" icon="i-lucide-send" :loading="sending" :disabled="!confirmed || dryBusy || dry?.status !== 'active'" @click="send" />
              <ErrorNotice :error="sendError" title="Not sent" />
              <div v-if="sent" class="space-y-2 rounded-lg border border-success/40 p-4 text-sm">
                <p v-if="!sent.trace" class="text-muted">
                  Sent. Waiting for the network to process it…
                </p>
                <template v-else>
                  <p class="font-medium text-success">
                    Done. Check the account again to see its new status.
                  </p>
                  <ExplorerLinks kind="tx" :value="sent.trace.external_hash" />
                </template>
              </div>
            </div>
          </WalletGate>
        </section>
      </template>
    </template>
  </div>
</template>
