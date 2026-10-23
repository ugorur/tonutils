<script setup lang="ts">
import TxDetails from '~/lib/tx-dev/TxDetails.vue'
import { Cell } from '@ton/core'
import { parseBoc } from '~/utils/ton/messages'
import { detectWalletVersion } from '~/utils/ton/wallets'
import {
  actionRows, actionTitle, explainEmulatorError, externalBoc, inspectExternal, summarizeTrace, transferMessage,
  unsignedTransferBody, walletFromState, type EmulateResponse, type ExternalInfo, type TraceSummary, type V3Action, type WalletState
} from './logic'

// Real funded mainnet wallets (toncenter v3 /walletInformation, 2026-10-23): W5 v5R1, v4R2, v3R2.
const WALLETS = [
  { label: 'W5 wallet', value: 'UQBVIQmfThv_WOjMm2AbAQtbpG-8HoBI-zZIlM0AYUqEBm9I' },
  { label: 'v4R2 wallet', value: 'UQDhb9HjfIVe0V-hunPdShPwMq6yFV_PZdiYbRimFms8-O2a' },
  { label: 'v3R2 wallet', value: 'UQCjk1hh952vWaE9bRguFkAhDAL5jj3xj9p0uPWrFBq_GB7X' }
]

const mode = ref<'build' | 'boc'>('build')
const tabs = [
  { label: 'Simulate a transfer', value: 'build', icon: 'i-lucide-send' },
  { label: 'Paste a signed message', value: 'boc', icon: 'i-lucide-file-code' }
]

// build mode
const from = ref('')
const to = ref('')
const amountText = ref('')
const amount = ref<bigint | null>(null)
const comment = ref('')
const payloadBoc = ref('')
const showAdvanced = ref(false)
// boc mode
const boc = ref('')
const ignoreSig = ref(false)

const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
const wallet = ref<WalletState | null>(null)
const ext = ref<ExternalInfo | null>(null)
const summary = ref<TraceSummary | null>(null)
const actions = ref<V3Action[]>([])
const sentBoc = ref('')
const open = ref<number | null>(0)

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()
const { wallet: connected } = useTonConnect()

function reset() {
  error.value = null
  summary.value = null
  actions.value = []
  ext.value = null
  wallet.value = null
  open.value = 0
}

async function emulate(b64: string, ignoreChksig: boolean, walletVersion: () => Promise<string | null>) {
  stage.value = 'Emulating on the current chain state…'
  sentBoc.value = b64
  try {
    const post = () => rateLimitedJson<EmulateResponse>(`${tc.baseUrl()}/emulate/v1/emulateTrace`, { provider: 'toncenter', retries: 0 }, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ boc: b64, ignore_chksig: ignoreChksig, with_actions: true })
    })
    // Retry only rate limits: a rejected message is a 500 with a JSON reason, and re-running it is pointless.
    let r: EmulateResponse | undefined
    for (let i = 0; !r; i++) {
      try {
        r = await post()
      }
      catch (e) {
        if (!(e instanceof TonApiError && e.isRateLimit) || i >= 3) throw e
        await new Promise(res => setTimeout(res, 1500 * (i + 1)))
      }
    }
    summary.value = summarizeTrace(r, isTestnet.value)
    actions.value = r.actions ?? []
  }
  catch (e) {
    const body = e instanceof TonApiError ? (e.body as { error?: string } | undefined) : undefined
    if (body?.error && !(e as TonApiError).isRateLimit) throw new Error(explainEmulatorError(body.error, await walletVersion().catch(() => null)))
    throw e
  }
}

async function runBuild() {
  reset()
  loading.value = true
  try {
    stage.value = 'Reading the wallet state from toncenter…'
    const acc = await tc.v3<{ code: string | null, data: string | null, status: string }>('account', { address: from.value.trim() })
    const w = walletFromState(from.value.trim(), acc.code, acc.data)
    wallet.value = w
    const msg = transferMessage({ to: to.value, amount: amount.value!, comment: comment.value, payloadBoc: showAdvanced.value ? payloadBoc.value : '' })
    const body = await unsignedTransferBody(w, { messages: [msg], validUntil: Math.floor(Date.now() / 1000) + 300, network: network.value })
    await emulate(externalBoc(w.address, body), true, async () => w.version)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

async function runBoc() {
  reset()
  loading.value = true
  try {
    ext.value = inspectExternal(boc.value)
    const dest = ext.value.dest
    // Only on a rejection: read the target's code hash so wallet exit codes (seqno, expiry…) are explained.
    const version = async () => {
      const acc = await tc.v3<{ code: string | null }>('account', { address: dest })
      return acc.code ? detectWalletVersion(Cell.fromBase64(acc.code).hash().toString('base64'))?.version ?? null : null
    }
    await emulate(parseBoc(boc.value).toBoc().toString('base64'), ignoreSig.value, version)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function exampleWallet(v: string) {
  from.value = v
  to.value = v
  amountText.value = '0.01'
  comment.value = 'hello'
}

function useConnected() {
  if (connected.value) from.value = connected.value.friendly
}

const canBuild = computed(() => !!from.value.trim() && !!to.value.trim() && amount.value !== null)
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="mode" :items="tabs" :content="false" class="w-full" />

    <form v-if="mode === 'build'" class="space-y-4" @submit.prevent="runBuild">
      <p class="text-sm text-muted">
        Builds the exact external message your wallet app would sign (same seqno, wallet id and send mode 3), leaves the signature empty and runs it with signature checks off. Nothing is signed or broadcast.
      </p>
      <div class="space-y-1">
        <AddressInput v-model="from" label="Sending wallet (W5, v4R2 or v3R2)" required />
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="text-muted">Try:</span>
          <UButton v-for="w in WALLETS" :key="w.label" :label="w.label" variant="link" size="sm" class="px-0" @click="exampleWallet(w.value)" />
          <UButton v-if="connected" label="My connected wallet" variant="link" size="sm" class="px-0" icon="i-lucide-wallet" @click="useConnected" />
        </div>
      </div>
      <AddressInput v-model="to" label="Recipient" required />
      <div class="grid gap-4 sm:grid-cols-2">
        <AmountInput v-model="amountText" v-model:nano="amount" :label="`Amount (${COIN_SYMBOL})`" />
        <UFormField label="Comment (optional)">
          <UInput v-model="comment" placeholder="Text comment" class="w-full" size="lg" :disabled="showAdvanced && !!payloadBoc.trim()" />
        </UFormField>
      </div>
      <div>
        <UButton
          :label="showAdvanced ? 'Hide raw body' : 'Advanced: send a raw body BOC instead of a comment'"
          :icon="showAdvanced ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="px-0"
          @click="showAdvanced = !showAdvanced"
        />
        <UFormField v-if="showAdvanced" label="Body BOC (base64 or hex)" hint="e.g. a jetton transfer body" class="mt-2">
          <UTextarea v-model="payloadBoc" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cck…" />
        </UFormField>
      </div>
      <UButton type="submit" label="Simulate" icon="i-lucide-flask-conical" size="lg" :loading="loading" :disabled="!canBuild" class="w-full justify-center sm:w-auto" />
    </form>

    <form v-else class="space-y-4" @submit.prevent="runBoc">
      <UFormField label="Signed external message BOC" hint="What a wallet or script passes to sendBoc">
        <UTextarea v-model="boc" :rows="4" autoresize :maxrows="10" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cckEB…" spellcheck="false" />
      </UFormField>
      <p class="text-xs text-dimmed">
        The message is sent to toncenter's emulator ({{ network }}), which runs it without broadcasting. It is a signed message, not a key: on its own it can only do what it already says.
      </p>
      <UCheckbox v-model="ignoreSig" label="Ignore the signature check" description="Use for unsigned or test messages. A real wallet would reject them." />
      <UButton type="submit" label="Emulate" icon="i-lucide-flask-conical" size="lg" :loading="loading" :disabled="!boc.trim()" class="w-full justify-center sm:w-auto" />
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Emulation failed" @retry="mode === 'build' ? runBuild() : runBoc()" />

    <template v-if="summary && !loading">
      <UAlert
        :color="summary.ok ? 'success' : 'error'"
        variant="subtle"
        :icon="summary.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
        :title="summary.ok ? 'Every step succeeded' : 'At least one step failed'"
        :description="`${summary.rows.length} transaction${summary.rows.length === 1 ? '' : 's'} · total fees ${formatCoin(summary.totalFees)}${summary.incomplete ? ' · trace cut short by the emulator' : ''}. Emulated on ${network}; nothing was broadcast.`"
      />

      <div v-if="wallet" class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>Wallet: <span class="text-highlighted">{{ wallet.label }}</span></span>
        <span>Seqno: <span class="font-mono text-highlighted">{{ wallet.seqno }}</span></span>
        <span>Signature: <span class="text-highlighted">empty (check skipped)</span></span>
      </div>
      <div v-if="ext" class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>To: <AddressLink :address="ext.dest" /></span>
        <span v-if="ext.hasInit">Carries StateInit (deploys the contract)</span>
        <span class="min-w-0 break-all">Normalized hash: <span class="font-mono text-xs text-highlighted">{{ ext.normHash }}</span> <CopyButton :value="ext.normHash" size="xs" /></span>
      </div>

      <section aria-label="Balance changes" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Balance changes
        </h3>
        <div class="divide-y divide-default rounded-lg border border-default px-3">
          <div v-for="b in summary.balances" :key="b.account" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
            <AddressLink :address="b.account" />
            <TokenAmount :nano="b.delta" class="font-mono" :class="b.delta < 0n ? 'text-error' : 'text-success'" />
          </div>
        </div>
        <p class="text-xs text-dimmed">
          {{ COIN_SYMBOL }} only, fees included. Token movements are listed under Actions.
        </p>
      </section>

      <section v-if="actions.length" aria-label="Actions" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Actions
        </h3>
        <div v-for="a in actions" :key="a.action_id ?? a.type" class="rounded-lg border border-default p-3 text-sm">
          <div class="flex items-center gap-2">
            <UIcon :name="a.success ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :class="a.success ? 'text-success' : 'text-error'" class="size-4" />
            <span class="font-medium text-highlighted">{{ actionTitle(a.type) }}</span>
          </div>
          <dl class="mt-2 grid gap-x-4 sm:grid-cols-[minmax(7rem,auto)_1fr] sm:gap-y-1">
            <template v-for="r in actionRows(a.details)" :key="r.label">
              <dt class="mt-1 text-xs text-muted first-letter:uppercase sm:mt-0 sm:text-sm">
                {{ r.label }}
              </dt>
              <dd class="min-w-0 break-all">
                <AddressLink v-if="r.kind === 'address'" :address="r.value" />
                <TokenAmount v-else-if="r.kind === 'coin'" :nano="r.value" />
                <span v-else class="font-mono">{{ r.value }}</span>
              </dd>
            </template>
          </dl>
        </div>
      </section>

      <section aria-label="Trace" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Trace
        </h3>
        <div v-for="(r, i) in summary.rows" :key="r.tx.hash" :style="{ marginLeft: `${Math.min(r.depth, 4) * 0.75}rem` }" class="rounded-lg border border-default">
          <button type="button" class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left text-sm" :aria-expanded="open === i" @click="open = open === i ? null : i">
            <UIcon :name="open === i ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4 text-muted" />
            <UIcon :name="r.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :class="r.ok ? 'text-success' : 'text-error'" class="size-4" />
            <span class="font-medium text-highlighted">{{ r.tx.inMsg?.decoded && r.tx.inMsg.kind === 'internal' ? r.tx.inMsg.decoded.title : r.tx.inMsg?.kind === 'external-in' ? 'External message' : 'Transaction' }}</span>
            <AddressLink :address="r.tx.account" no-links />
            <span class="text-muted">{{ r.label }}</span>
          </button>
          <div v-if="open === i" class="border-t border-default p-3 sm:p-4">
            <TxDetails :tx="r.tx" :wallet-version="r.depth === 0 ? wallet?.version : null" emulated />
          </div>
        </div>
      </section>

      <ResultField v-if="mode === 'build'" label="Emulated external message (unsigned, base64 BOC)" :value="sentBoc" hint="Zero signature: a real network would reject it. Your wallet app signs its own copy." />
    </template>
  </div>
</template>
