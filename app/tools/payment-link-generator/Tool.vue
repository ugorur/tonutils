<script setup lang="ts">
import { draftFromLink, emptyDraft } from '~/lib/payments/form'
import type { LinkKind } from '~/lib/payments/link'
import { formatAsset, requestFromQuery, requestQuery } from '~/lib/payments/link'
import PaymentForm from '~/lib/payments/PaymentForm.vue'
import PaymentLinks from '~/lib/payments/PaymentLinks.vue'
import PaymentQr from '~/lib/payments/PaymentQr.vue'
import { USDT_MASTER } from '~/utils/ton/jetton'
import { generate, qrFilename } from './logic'

const route = useRoute()
const { isTestnet } = useTonNetwork()

// Prefill from ?to=&amount=&jetton=&text=&exp= (links from the other payment tools).
const fromQuery = requestFromQuery(route.query)
const draft = ref(fromQuery ? draftFromLink(fromQuery) : emptyDraft())
const out = computed(() => generate(draft.value, { testnet: isTestnet.value }))
const req = computed(() => out.value.request)

const qrKind = ref<LinkKind>('ton')
const qrValue = computed(() => out.value.links.find(l => l.kind === qrKind.value)?.url ?? out.value.links[0]?.url ?? '')
const QR_KINDS = [
  { label: 'ton:// (any wallet)', value: 'ton' },
  { label: 'Keeper link', value: 'keeper' }
]

const shareQuery = computed(() => (req.value ? requestQuery(req.value, { testnet: isTestnet.value, decimals: out.value.asset.decimals }) : ''))
const summary = computed(() => {
  const r = req.value
  if (!r) return ''
  const what = r.amount !== undefined ? formatAsset(r.amount, out.value.asset) : `any amount of ${out.value.asset.symbol}`
  const extra = [r.text ? `comment “${r.text}”` : '', r.bin ? 'a binary body' : '', r.exp ? `expires ${new Date(r.exp * 1000).toLocaleString()}` : ''].filter(Boolean)
  return `Requests ${what}${extra.length ? `, ${extra.join(', ')}` : ''}.`
})

function example(jetton = false) {
  draft.value = {
    ...emptyDraft(),
    to: 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K',
    asset: jetton ? USDT_MASTER : 'coin',
    amount: jetton ? '25' : '5',
    text: 'Order #1042'
  }
}
</script>

<template>
  <div class="space-y-6">
    <PaymentForm v-model="draft" :result="out" expiry bin />

    <div class="flex flex-wrap gap-x-4">
      <UButton :label="`Try an example (${COIN_SYMBOL})`" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example()" />
      <UButton v-if="!isTestnet" label="Try a USD₮ example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example-usdt" @click="example(true)" />
    </div>

    <section v-if="req" class="space-y-4" aria-labelledby="links-h" data-testid="generator-result">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="links-h" class="font-display text-sm font-semibold text-highlighted">
          Your payment link
        </h3>
        <p class="text-sm text-muted" data-testid="summary">
          {{ summary }}
        </p>
      </div>

      <div class="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
        <div class="flex flex-col items-center gap-3">
          <UTabs v-model="qrKind" :items="QR_KINDS" :content="false" size="xs" />
          <PaymentQr :value="qrValue" :filename="qrFilename(req.to, draft.amount, out.asset.symbol)" />
          <p class="max-w-56 text-center text-xs text-muted">
            Scan with Keeper, MyTonWallet, Tonhub or another TON wallet.
          </p>
        </div>
        <div class="min-w-0 space-y-3">
          <PaymentLinks :request="req" :extras="{ testnet: isTestnet, decimals: out.asset.decimals }" />
          <p class="text-xs text-muted">
            Telegram's built-in wallet has no documented transfer link: Telegram users can scan the QR from another wallet or use the checkout page with TonConnect.
            Amounts in links are in base units ({{ NANO_NAME }}, formerly {{ NANO_FORMER }}, or the token's smallest unit).
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton :to="`/tools/pay-button-generator${shareQuery}`" label="Make a website button" icon="i-lucide-mouse-pointer-click" size="sm" variant="outline" />
            <UButton :to="`/tools/invoice-checker${shareQuery}&since=${Math.floor(Date.now() / 1000) - 60}`" label="Watch for this payment" icon="i-lucide-receipt" size="sm" variant="outline" />
          </div>
        </div>
      </div>
    </section>
    <p v-else-if="!draft.to.trim()" class="text-sm text-muted">
      Enter the address that should receive the payment to get a link and QR code.
    </p>
  </div>
</template>
