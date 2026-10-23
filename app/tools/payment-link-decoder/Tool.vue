<script setup lang="ts">
import { formatAsset, formatDuration } from '~/lib/payments/link'
import PaymentLinks from '~/lib/payments/PaymentLinks.vue'
import RecipientCheck from '~/lib/payments/RecipientCheck.vue'
import { useAsset } from '~/lib/payments/useAsset'
import { USDT_MASTER } from '~/utils/ton/jetton'
import { decode, decodedBin, expiryState } from './logic'

const { isTestnet } = useTonNetwork()
const input = ref('')
const result = computed(() => decode(input.value))
const link = computed(() => (result.value.ok ? result.value.link : null))
const req = computed(() => link.value?.request ?? null)

const { asset, error: assetError, loading: assetLoading, reload: reloadAsset } = useAsset(() => req.value?.jetton, () => link.value?.extras.decimals)
const body = computed(() => (req.value ? decodedBin(req.value, isTestnet.value) : null))
const now = ref(Date.now() / 1000)
const clock = setInterval(() => (now.value = Date.now() / 1000), 1000)
onBeforeUnmount(() => clearInterval(clock))
const expiry = computed(() => expiryState(req.value?.exp, now.value))

const SOURCE: Record<string, string> = { ton: 'ton:// transfer link', keeper: 'Keeper (Tonkeeper) link', tonhub: 'Tonhub link', tonutils: 'TonUtils checkout / invoice link' }
const VERIFY: Record<string, { label: string, color: 'success' | 'neutral' | 'warning' | 'error' }> = {
  known: { label: 'Well-known token', color: 'success' },
  whitelist: { label: 'Verified by tonapi', color: 'success' },
  none: { label: 'Not verified: check the token address', color: 'warning' },
  graylist: { label: 'Suspicious (tonapi graylist)', color: 'warning' },
  blacklist: { label: 'Scam token (tonapi blacklist)', color: 'error' }
}

const networkNote = computed(() => {
  const l = link.value
  if (!l) return null
  if (l.testOnly && !isTestnet.value) return 'The recipient is written in testnet form (0Q…/kQ…). This link is meant for testnet: mainnet wallets may refuse it.'
  if (l.extras.testnet && !isTestnet.value) return 'This TonUtils link was created for testnet. Switch the network in the header to check it.'
  return null
})

const EXAMPLES = [
  { label: `${COIN_SYMBOL} with comment`, value: 'ton://transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K?amount=5000000000&text=Order%20%231042' },
  { label: 'USD₮ (Keeper link)', value: `https://app.tonkeeper.com/transfer/UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K?jetton=${USDT_MASTER}&amount=25000000&text=Invoice%2042` },
  { label: 'Binary body', value: 'ton://transfer/EQD2NmD_lH5f5u1Kj3KfGyTvhZSX0Eg6qp2a5IQUKXxOG21n?amount=50000000&bin=te6cckEBAQEAKQAATgAAAAAxMDAwIFRlbGVncmFtIFN0YXJzIAoKUmVmI3ZxUkJodXBBR7skUgg&exp=2147483647' }
]
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <UFormField label="Payment link" hint="ton://, Keeper, Tonhub or TonUtils link">
        <UTextarea v-model="input" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-sm break-all' }" placeholder="ton://transfer/UQ…?amount=…&text=…" spellcheck="false" data-testid="link-input" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="input = e.value" />
      </div>
      <QrScan @result="input = $event" />
    </div>

    <UAlert
      v-if="!result.ok && result.kind !== 'empty'"
      :color="result.kind === 'tonconnect' ? 'warning' : result.kind === 'address' ? 'info' : 'error'"
      variant="subtle"
      icon="i-lucide-info"
      :title="result.kind === 'address' ? 'Plain address' : result.kind === 'tonconnect' ? 'TonConnect request' : 'Cannot decode'"
      :description="result.error"
      :actions="result.kind === 'address' ? [{ label: 'Create a payment link for it', to: `/tools/payment-link-generator?to=${result.address}`, variant: 'outline' }] : undefined"
      data-testid="decode-error"
    />

    <section v-if="link && req" class="space-y-4" aria-labelledby="dec-h" data-testid="decode-result">
      <div class="flex flex-wrap items-center gap-2">
        <h3 id="dec-h" class="font-display text-sm font-semibold text-highlighted">
          This link asks you to pay
        </h3>
        <UBadge color="neutral" variant="outline" :label="SOURCE[link.source]" />
      </div>

      <div class="rounded-lg border border-default p-4">
        <div class="text-xs text-muted">
          Amount
        </div>
        <div class="mt-1 font-display text-2xl font-semibold text-highlighted" data-testid="decoded-amount">
          <template v-if="req.amount === undefined">
            Not set: you choose the amount
          </template>
          <template v-else-if="asset">
            {{ formatAsset(req.amount, asset) }}
          </template>
          <template v-else>
            {{ req.amount.toString() }} base units
          </template>
        </div>
        <div v-if="req.jetton" class="mt-2 space-y-2 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted">Token</span>
            <span v-if="asset" class="font-medium text-highlighted">{{ asset.name }} ({{ asset.symbol }})</span>
            <UBadge v-if="asset" :color="VERIFY[asset.verification]?.color ?? 'neutral'" variant="subtle" :label="VERIFY[asset.verification]?.label ?? asset.verification" />
            <LoadingState v-if="assetLoading" label="Reading token info…" />
          </div>
          <div class="font-mono text-xs break-all text-muted">
            {{ req.jetton }}
          </div>
          <ErrorNotice v-if="assetError" :error="assetError" title="Could not read the token" @retry="reloadAsset" />
        </div>
        <p v-if="req.amount !== undefined && !req.jetton" class="mt-1 text-xs text-muted">
          {{ req.amount.toString() }} {{ NANO_NAME }} (formerly {{ NANO_FORMER }})
        </p>
      </div>

      <UAlert v-if="networkNote" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="networkNote" />

      <RecipientCheck :address="req.to" :purpose="req.jetton ? 'jetton' : 'coin'" :comment="body ? '' : req.text ?? ''" />

      <div class="divide-y divide-default rounded-lg border border-default px-4">
        <ResultField v-if="link.extras.label" label="Description (set by whoever made the link)" :value="link.extras.label" :mono="false" />
        <ResultField label="Comment" :value="req.text ?? ''" :mono="false" :hint="req.text ? (body ? 'Not sent: wallets attach the binary body below instead.' : 'Sent publicly with the payment. Exchanges and shops use it to identify you.') : body ? 'Replaced by the binary body below.' : 'None'" />
        <ResultField label="Expiry" :value="expiry.kind === 'none' ? '' : expiry.at.toLocaleString()" :mono="false" :copy="false">
          <span v-if="expiry.kind === 'none'">None</span>
          <span v-else>
            {{ expiry.at.toLocaleString() }}
            <UBadge v-if="expiry.kind === 'expired'" color="error" variant="subtle" label="Expired: wallets will refuse it" class="ml-1" />
            <UBadge v-else color="success" variant="subtle" :label="`${formatDuration(expiry.seconds)} left`" class="ml-1" />
          </span>
        </ResultField>
      </div>

      <div v-if="body" class="space-y-2 rounded-lg border border-default p-4" data-testid="decoded-body">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-medium text-highlighted">Binary body</span>
          <UBadge :color="body.name === 'unknown' || body.error ? 'warning' : 'primary'" variant="subtle" :label="body.opHex ? `${body.title} · ${body.opHex}` : body.title" />
        </div>
        <p class="text-xs text-muted">
          Your wallet signs this exact cell. Keeper shows a blind-signing warning for it. Only continue if you know what it does.
        </p>
        <JsonView :value="body.fields" label="Decoded fields" />
        <ResultField label="BOC (base64url)" :value="req.bin ?? ''" />
      </div>

      <UAlert v-for="w in link.warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="w" />

      <div class="space-y-2">
        <h4 class="text-sm font-medium text-highlighted">
          Same request in other formats
        </h4>
        <PaymentLinks :request="req" :extras="link.extras" />
      </div>

      <details class="text-sm">
        <summary class="cursor-pointer text-muted">
          All parameters ({{ link.params.length }})
        </summary>
        <dl class="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[8rem_1fr]">
          <template v-for="([k, v], i) in link.params" :key="i">
            <dt class="font-mono text-muted">
              {{ k }}
            </dt>
            <dd class="font-mono break-all text-highlighted">
              {{ v || '—' }}
            </dd>
          </template>
        </dl>
      </details>
    </section>
  </div>
</template>
