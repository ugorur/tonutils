<script setup lang="ts">
import { draftToRequest, emptyDraft } from '~/lib/payments/form'
import { buildLink, formatAsset, formatDuration, INVOICE_PATH, newInvoiceId, parsePaymentLink, requestFromQuery, requestQuery, secondsLeft } from '~/lib/payments/link'
import PaymentForm from '~/lib/payments/PaymentForm.vue'
import PaymentLinks from '~/lib/payments/PaymentLinks.vue'
import PaymentQr from '~/lib/payments/PaymentQr.vue'
import { useAsset } from '~/lib/payments/useAsset'
import { usePaymentWatch } from '~/lib/payments/usePaymentWatch'
import type { TonapiEvent } from './logic'
import { difference, exampleFromEvents, receiptRows, specFor } from './logic'

const route = useRoute()
const tonapi = useTonapi()
const { isTestnet, toggle } = useTonNetwork()

// The invoice lives in the URL (?to=&amount=&jetton=&text=&since=…): reloads and bookmarks keep it.
const link = computed(() => requestFromQuery(route.query))
const req = computed(() => link.value?.request ?? null)
const invalid = computed(() => !link.value && !!route.query.to)
const linkTestnet = computed(() => !!link.value?.extras.testnet)
const networkOk = computed(() => linkTestnet.value === isTestnet.value)
const nowSec = () => Math.floor(Date.now() / 1000)

// ---------------------------------------------------------------- create
const draft = ref({ ...emptyDraft(), text: newInvoiceId() })
const label = ref('')
const out = computed(() => draftToRequest(draft.value, { testnet: isTestnet.value }))
const watchable = computed(() => (out.value.request ? specFor(out.value.request) : null))

function start() {
  const r = out.value.request
  if (!r || !watchable.value) return
  navigateTo(INVOICE_PATH + requestQuery(r, { testnet: isTestnet.value, decimals: out.value.asset.decimals, label: label.value.trim() || undefined, since: nowSec() - 60 }))
}

const pasted = ref('')
const pastedResult = computed(() => (pasted.value.trim() ? parsePaymentLink(pasted.value) : null))
function watchPasted() {
  const p = pastedResult.value
  if (!p?.ok) return
  // No `since`: an existing link may already have been paid, so the recent history is searched too.
  navigateTo(INVOICE_PATH + requestQuery(p.link.request, { ...p.link.extras, since: undefined, testnet: p.link.extras.testnet || p.link.testOnly }))
}

const FRAGMENT = 'EQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOoy2'
const exLoading = ref(false)
const exError = ref<unknown>(null)
async function example() {
  exLoading.value = true
  exError.value = null
  try {
    const r = await tonapi.get<{ events: TonapiEvent[] }>(`accounts/${FRAGMENT}/events`, { limit: 10 })
    const ex = exampleFromEvents(r.events, FRAGMENT)
    if (!ex) throw new Error('No recent commented payment found. Try again in a few seconds.')
    navigateTo(INVOICE_PATH + requestQuery(ex.request, { since: ex.since, label: 'Example: a real payment someone just made to Fragment' }))
  }
  catch (e) {
    exError.value = e
  }
  finally {
    exLoading.value = false
  }
}

// ---------------------------------------------------------------- watch
const spec = computed(() => (req.value && networkOk.value ? specFor(req.value, link.value?.extras.since) : null))
const { asset, error: assetError, reload: reloadAsset } = useAsset(() => req.value?.jetton, () => link.value?.extras.decimals)
const watcher = usePaymentWatch(() => spec.value)
const state = watcher.state

const fmt = (n: bigint) => (asset.value ? formatAsset(n, asset.value) : `${n} base units`)
const diff = computed(() => difference(state.value, req.value?.amount))

const now = ref(nowSec())
const clock = setInterval(() => (now.value = nowSec()), 1000)
onBeforeUnmount(() => clearInterval(clock))
const left = computed(() => secondsLeft(req.value?.exp, now.value))

const STATUS = computed(() => {
  const s = state.value.status
  const d = diff.value
  if (s === 'paid') return { color: 'success', icon: 'i-lucide-circle-check', title: 'Paid', text: `Received ${fmt(state.value.total)}.` }
  if (s === 'overpaid') return { color: 'success', icon: 'i-lucide-circle-check', title: 'Paid (more than requested)', text: `Received ${fmt(state.value.total)}, ${fmt(d ?? 0n)} more than the invoice.` }
  if (s === 'underpaid') return { color: 'warning', icon: 'i-lucide-circle-alert', title: 'Partly paid', text: `Received ${fmt(state.value.total)}. Still missing ${fmt(-(d ?? 0n))}. Still watching.` }
  if (s === 'pending') return { color: 'info', icon: 'i-lucide-loader-circle', title: 'Payment seen, confirming…', text: 'The transfer is on chain and its last steps are still processing. This takes a few seconds.' }
  if (left.value !== null && left.value <= 0) return { color: 'neutral', icon: 'i-lucide-clock-alert', title: 'Expired, not paid', text: 'The link expired, so wallets refuse it. Still watching in case someone paid manually.' }
  return { color: 'neutral', icon: 'i-lucide-hourglass', title: 'Waiting for the payment', text: 'Checks every 10 seconds while this tab is open. You can close it and come back: the invoice is in the URL.' }
})

const pageUrl = computed(() => (import.meta.client ? window.location.origin + route.fullPath : ''))
const csvRows = computed(() => receiptRows(state.value.payments, fmt))
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="invalid" color="error" variant="subtle" icon="i-lucide-circle-x" title="Invalid invoice link" description="The parameters in this URL are not a valid payment request." :actions="[{ label: 'Create a new invoice', to: INVOICE_PATH, variant: 'outline' }]" />

    <!-- create -->
    <template v-else-if="!link">
      <PaymentForm v-model="draft" :result="out" expiry amount-hint="Recommended: the exact amount you expect" comment-label="Invoice ID (comment)" comment-hint="Must be unique">
        <template #comment-action>
          <UButton icon="i-lucide-refresh-cw" label="New ID" variant="outline" color="neutral" size="lg" @click="draft.text = newInvoiceId()" />
        </template>
        <template #comment-help>
          The payer's wallet sends this text with the payment, and that is how the watcher recognises it. Keep one ID per invoice. Comments are public on chain.
        </template>
      </PaymentForm>
      <UFormField label="Description (optional)" hint="Shown on the invoice, not sent on chain">
        <UInput v-model="label" class="w-full" size="lg" maxlength="200" placeholder="e.g. Logo design, October" />
      </UFormField>

      <UAlert v-if="out.request && !watchable" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="Add an invoice ID (comment) or an exact amount: without either, a payment cannot be told apart from other transfers." />
      <div class="flex flex-wrap items-center gap-3">
        <UButton label="Create invoice & start watching" icon="i-lucide-play" size="lg" :disabled="!watchable" data-testid="start-watch" @click="start" />
        <UButton v-if="!isTestnet" label="Watch a live example" icon="i-lucide-sparkles" variant="link" size="sm" :loading="exLoading" data-testid="try-example" @click="example" />
      </div>
      <ErrorNotice v-if="exError" :error="exError" title="Could not load the example" @retry="example" />

      <USeparator label="or" />
      <UFormField label="Watch an existing payment link" hint="ton://, Keeper, Tonhub or TonUtils link">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput v-model="pasted" class="w-full" size="lg" :ui="{ base: 'font-mono text-sm' }" placeholder="ton://transfer/UQ…?amount=…&text=…" spellcheck="false" />
          <UButton label="Watch" icon="i-lucide-eye" size="lg" variant="outline" :disabled="!pastedResult?.ok || !specFor(pastedResult.link.request)" @click="watchPasted" />
        </div>
      </UFormField>
      <p v-if="pastedResult && !pastedResult.ok" class="text-sm text-error">
        {{ pastedResult.error }}
      </p>
      <p v-else-if="pastedResult?.ok && !specFor(pastedResult.link.request)" class="text-sm text-warning">
        This link has no comment and no amount (or carries a binary body), so its payment cannot be recognised.
      </p>
    </template>

    <!-- watch -->
    <template v-else-if="link && req">
      <UAlert
        v-if="!networkOk"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Different network"
        :description="`This invoice is for ${linkTestnet ? 'testnet' : 'mainnet'}, but TonUtils is set to ${isTestnet ? 'testnet' : 'mainnet'}.`"
        :actions="[{ label: `Switch to ${linkTestnet ? 'testnet' : 'mainnet'}`, color: 'warning', variant: 'outline', onClick: toggle }]"
      />
      <UAlert v-else-if="!spec" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="This invoice has no comment and no amount (or carries a binary body), so its payment cannot be recognised." />

      <div v-if="spec" class="flex items-start gap-3 rounded-lg border p-4" :class="{ 'border-success/40 bg-success/5': STATUS.color === 'success', 'border-warning/40 bg-warning/5': STATUS.color === 'warning', 'border-info/40 bg-info/5': STATUS.color === 'info', 'border-default': STATUS.color === 'neutral' }" role="status" data-testid="invoice-status">
        <UIcon :name="STATUS.icon" class="mt-0.5 size-6 shrink-0" :class="{ 'text-success': STATUS.color === 'success', 'text-warning': STATUS.color === 'warning', 'text-info animate-spin': STATUS.color === 'info', 'text-muted': STATUS.color === 'neutral' }" />
        <div class="min-w-0 flex-1">
          <p class="font-display font-semibold text-highlighted">
            {{ STATUS.title }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ STATUS.text }}
          </p>
          <p class="mt-1 text-xs text-dimmed">
            <template v-if="watcher.checking.value">
              Checking…
            </template>
            <template v-else-if="watcher.lastChecked.value">
              Last checked {{ new Date(watcher.lastChecked.value).toLocaleTimeString() }}
            </template>
          </p>
        </div>
        <UButton label="Check now" icon="i-lucide-refresh-cw" size="sm" variant="outline" color="neutral" :loading="watcher.checking.value" class="shrink-0" @click="watcher.check()" />
      </div>
      <ErrorNotice v-if="watcher.error.value" :error="watcher.error.value" title="Could not check for payments" @retry="watcher.check()" />

      <section v-if="state.payments.length" class="space-y-2" aria-labelledby="rcpt-h" data-testid="receipt">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="rcpt-h" class="font-display text-sm font-semibold text-highlighted">
            Receipt
          </h3>
          <CsvExportButton :rows="csvRows" :filename="`receipt-${req.text?.slice(0, 24).replace(/[^\w-]+/g, '') || 'payment'}.csv`" />
        </div>
        <ul class="divide-y divide-default rounded-lg border border-default">
          <li v-for="p in state.payments" :key="p.eventId + p.amount" class="space-y-1.5 p-3 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-mono font-semibold text-highlighted">{{ fmt(p.amount) }}</span>
              <span class="text-xs text-muted">{{ new Date(p.timestamp * 1000).toLocaleString() }}</span>
            </div>
            <div v-if="p.sender" class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-muted">From</span>
              <span v-if="p.senderName" class="font-medium">{{ p.senderName }}</span>
              <AddressLink :address="p.sender" :bounceable="false" no-links />
            </div>
            <ExplorerLinks kind="tx" :value="p.eventId" />
          </li>
        </ul>
      </section>

      <div class="divide-y divide-default rounded-lg border border-default px-4" data-testid="invoice-summary">
        <ResultField v-if="link.extras.label" label="Description" :value="link.extras.label" :mono="false" :copy="false" />
        <ResultField label="Amount" :value="req.amount === undefined ? 'Any amount' : fmt(req.amount)" :copy="false" />
        <ResultField v-if="req.jetton" label="Token" :value="req.jetton" :hint="asset ? `${asset.name} (${asset.symbol})` : undefined" />
        <ResultField label="Invoice ID (comment)" :value="req.text ?? ''" :hint="req.text ? 'Payments are matched by this exact text.' : 'None: matched by exact amount.'" />
        <ResultField label="Receiving address" :value="req.to" />
        <ResultField label="Watching since" :value="link.extras.since ? new Date(link.extras.since * 1000).toLocaleString() : 'Recent history (last 500 events)'" :mono="false" :copy="false" />
        <ResultField v-if="req.exp" label="Expires" :value="new Date(req.exp * 1000).toLocaleString()" :mono="false" :copy="false" :hint="left !== null && left > 0 ? `${formatDuration(left)} left` : 'Expired'" />
      </div>
      <ErrorNotice v-if="assetError" :error="assetError" title="Could not read the token" @retry="reloadAsset" />

      <details class="rounded-lg border border-default p-4" :open="state.status === 'waiting'">
        <summary class="cursor-pointer text-sm font-medium text-highlighted">
          Send this to the payer
        </summary>
        <div class="mt-4 grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
          <div class="flex flex-col items-center gap-2">
            <PaymentQr :value="buildLink(req, 'ton')" :filename="`invoice-${req.text?.replace(/[^\w-]+/g, '') || 'qr'}`" />
            <p class="max-w-56 text-center text-xs text-muted">
              Scan with any TON wallet. The comment is filled in automatically.
            </p>
          </div>
          <PaymentLinks :request="req" :extras="link.extras" class="min-w-0" />
        </div>
      </details>

      <div class="flex flex-wrap items-center gap-2">
        <CopyButton :value="pageUrl" label="Copy this invoice's watch URL" />
        <UButton :to="INVOICE_PATH" label="New invoice" icon="i-lucide-plus" size="sm" variant="ghost" color="neutral" />
      </div>
      <p class="text-xs text-muted">
        Reads public data from tonapi.io in your browser. Nothing is stored on a server: anyone with the watch URL sees the same invoice.
      </p>
    </template>
  </div>
</template>
