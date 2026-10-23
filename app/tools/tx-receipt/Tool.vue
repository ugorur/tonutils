<script setup lang="ts">
import type { TaEvent } from '~/lib/tx-user/events'
import { assetKey, friendlyAddress } from '~/lib/tx-user/events'
import { parseTxInput } from '~/lib/tx-user/hash'
import { FIAT_CURRENCIES, fetchRatePoints, fiatValue, priceAt } from '~/lib/tx-user/rates'
import { explorerUrl } from '~/utils/ton/explorers'
import type { Receipt } from './logic'
import { buildReceipt, feeFromAccountEvent, receiptText, utcTime } from './logic'
import { receiptPng } from './png'

const EXAMPLES = [
  { label: `${COIN_SYMBOL} payment with comment`, value: 'ba0b99e961985275cad28e5aa1f356655774a9b5a77bb529e042e5f2398d2d15' },
  { label: 'USD₮ payment', value: '5b7fa27952f92f2c08ce35f27f9eb3e4dc87f38a43155fe5d31592f0b0a6d788' },
  { label: 'Failed transfer', value: 'b492e6f67440fc27201ae61900149107ada38869bfe3a85e0528e9686da3d2ca' }
]

const route = useRoute()
const router = useRouter()
const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const currency = ref<string>('USD')
const currencyItems: string[] = [...FIAT_CURRENCIES]
const inputError = computed(() => {
  if (!input.value.trim()) return ''
  try {
    parseTxInput(input.value)
    return ''
  }
  catch (e) {
    return (e as Error).message
  }
})

const loading = ref(false)
const error = ref<unknown>(null)
const notPayment = ref(false)
const receipt = ref<Receipt | null>(null)
// undefined = loading, null = unavailable
const fee = ref<bigint | null | undefined>()
const prices = ref<Map<string, number | null> | null | undefined>()

let run = 0

async function lookup() {
  let hash: string
  try {
    hash = parseTxInput(input.value)
  }
  catch {
    return
  }
  const id = ++run
  loading.value = true
  error.value = null
  notPayment.value = false
  receipt.value = null
  fee.value = undefined
  prices.value = undefined
  router.replace({ query: { ...route.query, q: input.value.trim() } })
  try {
    const ev = await tonapi.get<TaEvent>(`events/${hash}`)
    if (id !== run) return
    const r = buildReceipt(ev)
    if (!r) {
      notPayment.value = true
      return
    }
    receipt.value = r
    loading.value = false
    loadFee(r, id)
    loadPrices(r, id)
  }
  catch (e) {
    if (id === run) error.value = e
  }
  finally {
    if (id === run) loading.value = false
  }
}

async function loadFee(r: Receipt, id: number) {
  try {
    const ev = await tonapi.get<TaEvent>(`accounts/${r.payer!.address}/events/${r.eventId}`)
    if (id === run) fee.value = feeFromAccountEvent(ev, r.payer!.address)
  }
  catch {
    if (id === run) fee.value = null
  }
}

// Bumped on every price lookup so a slower lookup for a previous currency cannot overwrite a newer one.
let priceRun = 0
async function loadPrices(r: Receipt, id: number) {
  const my = ++priceRun
  const fresh = () => id === run && my === priceRun
  if (network.value === 'testnet') {
    prices.value = null
    return
  }
  const cur = currency.value
  const out = new Map<string, number | null>()
  try {
    for (const l of r.lines) {
      if (!l.value || out.has(assetKey(l.value.asset))) continue
      const pts = await fetchRatePoints(tonapi.get, l.value.asset, cur, r.time, r.time)
      out.set(assetKey(l.value.asset), priceAt(pts, r.time))
    }
    if (fresh()) prices.value = out
  }
  catch {
    if (fresh()) prices.value = null
  }
}

watch(currency, () => {
  if (receipt.value) {
    prices.value = undefined
    loadPrices(receipt.value, run)
  }
})
watch(network, () => {
  if (receipt.value || notPayment.value) lookup()
})
onMounted(() => {
  if (input.value && !inputError.value) lookup()
})

function useExample(v: string) {
  input.value = v
  lookup()
}

const lineFiat = (i: number) => {
  const l = receipt.value?.lines[i]
  const p = l?.value && prices.value ? prices.value.get(assetKey(l.value.asset)) : null
  return l?.value && p != null ? fiatValue(l.value.amount, l.value.asset.decimals, p) : null
}
const totalFiat = computed(() => {
  const r = receipt.value
  if (!r || !prices.value) return null
  const vals = r.lines.flatMap((l, i) => (l.value ? [lineFiat(i)] : []))
  if (!vals.length || vals.some(v => v === null)) return null
  return { currency: currency.value, value: vals.reduce((s, v) => s! + v!, 0)!, date: utcTime(r.time).slice(0, 10) }
})

const explorer = computed(() => (receipt.value ? explorerUrl('tonviewer', 'tx', receipt.value.eventId, network.value) ?? '' : ''))
const text = computed(() => (receipt.value ? receiptText(receipt.value, { fee: fee.value ?? undefined, fiat: totalFiat.value, explorer: explorer.value, testOnly: isTestnet.value }) : ''))
const unverified = computed(() => receipt.value?.lines.filter(l => l.value?.asset.master && l.value.asset.verification !== 'whitelist') ?? [])
const spam = computed(() => receipt.value?.lines.some(l => l.view.spam) ?? false)
const warning = computed(() => {
  const tokens = unverified.value.map(l => l.value!.asset.symbol).join(', ')
  const scam = spam.value ? 'tonapi flags an account or token in this transfer as a likely scam. ' : ''
  const fake = tokens ? `${tokens} is not on tonapi's verified token list. Fake copies of USD₮ and other tokens are common: compare the token contract below with the official one before accepting this as payment.` : 'Do not accept it as payment without checking the sender.'
  return scam + fake
})

const STATUS = {
  confirmed: { label: 'Confirmed', color: 'success', icon: 'i-lucide-circle-check' },
  pending: { label: 'Pending', color: 'warning', icon: 'i-lucide-clock' },
  failed: { label: 'Failed', color: 'error', icon: 'i-lucide-circle-x' }
} as const

const qr = ref<{ svg: string } | null>(null)
const pngError = ref<unknown>(null)
const pngBusy = ref(false)
async function downloadPng() {
  if (!receipt.value) return
  pngBusy.value = true
  pngError.value = null
  try {
    const blob = await receiptPng(text.value, qr.value?.svg ?? '')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `receipt-${receipt.value.eventId.slice(0, 12)}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  catch (e) {
    pngError.value = e
  }
  finally {
    pngBusy.value = false
  }
}
const print = () => window.print()
const when = (t: number) => new Date(t * 1000).toLocaleString([], { dateStyle: 'long', timeStyle: 'medium' })
const addr = (a: { address: string, is_wallet?: boolean }) => friendlyAddress(a.address, a.is_wallet ?? true, isTestnet.value)
const fiatText = (v: number, c: string) => new Intl.NumberFormat('en', { style: 'currency', currency: c }).format(v)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2 print:hidden" @submit.prevent="lookup">
      <UFormField label="Transaction hash or explorer link" :error="inputError || undefined" help="Hex or base64 transaction or message hash, or a Tonviewer / Tonscan link.">
        <UInput v-model="input" placeholder="e.g. ba0b99e9… or https://tonviewer.com/transaction/…" class="w-full font-mono" autocomplete="off" spellcheck="false" />
      </UFormField>
      <div class="flex flex-wrap items-end gap-3">
        <UButton type="submit" label="Make receipt" icon="i-lucide-receipt-text" :loading="loading" :disabled="!input.trim() || !!inputError" />
        <UFormField label="Fiat value in">
          <USelect v-model="currency" :items="currencyItems" class="w-28" />
        </UFormField>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="lookup" />
    <LoadingState v-else-if="loading" label="Reading the transaction from tonapi…" />
    <UAlert
      v-else-if="notPayment"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Not a payment"
      :description="`This transaction did not transfer ${COIN_SYMBOL}, a jetton or an NFT, so there is nothing to put on a receipt. Use the transaction explainer to see what it did.`"
    >
      <template #actions>
        <UButton :to="`/tools/tx-lookup?q=${encodeURIComponent(input.trim())}`" label="Explain transaction" size="sm" />
      </template>
    </UAlert>

    <template v-if="receipt && !loading">
      <UAlert
        v-if="spam || unverified.length"
        class="print:hidden"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        :title="spam ? 'Flagged as likely scam' : 'Unverified token'"
        :description="warning"
      />

      <article id="tx-receipt" class="space-y-5 rounded-xl border border-default bg-default p-5 sm:p-7">
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="font-display text-xl font-semibold text-highlighted">
              Payment receipt
            </h2>
            <p class="text-sm text-muted">
              TON network{{ isTestnet ? ' (testnet)' : '' }}
            </p>
          </div>
          <UBadge :color="STATUS[receipt.status].color" variant="subtle" size="lg" :icon="STATUS[receipt.status].icon" :label="STATUS[receipt.status].label" />
        </header>

        <div v-for="(l, i) in receipt.lines" :key="i" class="space-y-1 border-t border-default pt-4">
          <div class="text-xs text-muted uppercase">
            {{ l.view.type === 'NftItemTransfer' ? 'Item' : 'Amount' }}
          </div>
          <div class="font-display text-2xl font-semibold break-words text-highlighted">
            <TokenAmount v-if="l.value" :nano="l.value.amount" :decimals="l.value.asset.decimals" :symbol="l.value.asset.symbol" />
            <span v-else>{{ l.view.title }}</span>
          </div>
          <div v-if="l.value" class="text-sm text-muted">
            <template v-if="prices === undefined">
              Loading {{ currency }} value…
            </template>
            <template v-else-if="lineFiat(i) !== null">
              ≈ {{ fiatText(lineFiat(i)!, currency) }} at the {{ utcTime(receipt.time).slice(0, 10) }} rate
            </template>
            <template v-else>
              No {{ currency }} price available for this token at that date.
            </template>
          </div>
          <dl class="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
            <template v-if="l.view.to">
              <dt class="text-muted">
                To
              </dt>
              <dd class="min-w-0">
                <div v-if="l.view.to.name" class="font-medium text-highlighted">
                  {{ l.view.to.name }}
                </div>
                <span class="font-mono break-all text-default">{{ addr(l.view.to) }}</span>
              </dd>
            </template>
            <template v-if="l.view.comment || l.view.encrypted">
              <dt class="text-muted">
                Comment
              </dt>
              <dd class="break-words text-default">
                {{ l.view.comment ?? 'Encrypted comment' }}
              </dd>
            </template>
            <template v-if="l.value?.asset.master">
              <dt class="text-muted">
                Token contract
              </dt>
              <dd class="font-mono text-xs break-all text-default">
                {{ friendlyAddress(l.value.asset.master, false, isTestnet) }}
              </dd>
            </template>
          </dl>
        </div>

        <dl class="grid gap-x-4 gap-y-2 border-t border-default pt-4 text-sm sm:grid-cols-[8rem_1fr]">
          <dt class="text-muted">
            From
          </dt>
          <dd class="min-w-0">
            <div v-if="receipt.payer?.name" class="font-medium text-highlighted">
              {{ receipt.payer.name }}
            </div>
            <span class="font-mono break-all text-default">{{ receipt.payer ? addr(receipt.payer) : '—' }}</span>
          </dd>
          <dt class="text-muted">
            Date
          </dt>
          <dd class="text-default">
            {{ when(receipt.time) }} <span class="text-muted">({{ utcTime(receipt.time) }})</span>
          </dd>
          <dt class="text-muted">
            Network fee
          </dt>
          <dd class="text-default">
            <span v-if="fee === undefined" class="text-muted">Loading…</span>
            <TokenAmount v-else-if="fee !== null" :nano="fee" />
            <span v-else class="text-muted">Not available</span>
            <span class="text-muted"> paid by the sender</span>
          </dd>
          <dt class="text-muted">
            Transaction
          </dt>
          <dd class="font-mono text-xs break-all text-default">
            {{ receipt.eventId }}
          </dd>
        </dl>

        <footer class="flex flex-wrap items-center gap-4 border-t border-default pt-4">
          <QrCode ref="qr" :value="explorer" :size="120" />
          <div class="min-w-0 flex-1 space-y-1 text-sm">
            <p class="text-muted">
              Scan or open to verify on a public explorer:
            </p>
            <a :href="explorer" target="_blank" rel="noopener" class="font-mono text-xs break-all text-primary">{{ explorer }}</a>
            <p v-if="receipt.status === 'pending'" class="text-warning">
              Still being processed. Generate the receipt again once it is confirmed.
            </p>
            <p v-else-if="receipt.status === 'failed'" class="text-error">
              This transfer failed: the amount above did not reach the recipient. Only network fees were spent.
            </p>
          </div>
        </footer>
      </article>

      <div class="flex flex-wrap gap-2 print:hidden">
        <UButton label="Print / Save as PDF" icon="i-lucide-printer" @click="print" />
        <UButton label="Download PNG" icon="i-lucide-image-down" color="neutral" variant="outline" :loading="pngBusy || fee === undefined || prices === undefined" @click="downloadPng" />
        <CopyButton :value="text" label="Copy as text" size="md" />
        <UButton :to="`/tools/tx-lookup?q=${receipt.eventId}`" label="Full details" icon="i-lucide-scan-search" color="neutral" variant="ghost" />
      </div>
      <ErrorNotice v-if="pngError" :error="pngError" class="print:hidden" />
      <p class="text-xs text-muted print:hidden">
        Everything on this receipt comes from public blockchain data (tonapi.io); anyone can verify it with the link above. Fiat values use tonapi's daily rate and are an estimate.
      </p>
    </template>
  </div>
</template>

<style>
/* Scoped with :has so the rule cannot blank other pages after client-side navigation. */
@media print {
  body:has(#tx-receipt) * {
    visibility: hidden;
  }
  body:has(#tx-receipt) #tx-receipt,
  body:has(#tx-receipt) #tx-receipt * {
    visibility: visible;
  }
  body:has(#tx-receipt) #tx-receipt {
    position: absolute;
    inset: 0 0 auto 0;
    border: 0;
  }
}
</style>
