<script setup lang="ts">
import { Address } from '@ton/core'
import { draftToRequest, emptyDraft } from '~/lib/payments/form'
import { buildLink, formatAsset, formatDuration, HOSTED_PATH, requestFromQuery, requestQuery, secondsLeft } from '~/lib/payments/link'
import { specFor } from '~/lib/payments/match'
import PaymentForm from '~/lib/payments/PaymentForm.vue'
import PaymentLinks from '~/lib/payments/PaymentLinks.vue'
import PaymentQr from '~/lib/payments/PaymentQr.vue'
import RecipientCheck from '~/lib/payments/RecipientCheck.vue'
import { useAsset } from '~/lib/payments/useAsset'
import { usePaymentWatch } from '~/lib/payments/usePaymentWatch'
import type { TonapiJettonBalance } from '~/lib/wallet-actions/core'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { newQueryId, payBlocker, paymentMessage } from './logic'

const route = useRoute()
const tonapi = useTonapi()
const tc = useTonConnect()
const { network, isTestnet, toggle } = useTonNetwork()
const nowSec = () => Math.floor(Date.now() / 1000)

const link = computed(() => requestFromQuery(route.query))
const req = computed(() => link.value?.request ?? null)
const invalid = computed(() => !link.value && !!route.query.to)
const linkTestnet = computed(() => !!link.value?.extras.testnet)
const networkOk = computed(() => linkTestnet.value === isTestnet.value)

// ---------------------------------------------------------------- builder (no ?to=)
const draft = ref(emptyDraft())
const label = ref('')
const out = computed(() => draftToRequest(draft.value, { testnet: isTestnet.value }))
const shareUrl = computed(() => (out.value.request && import.meta.client
  ? window.location.origin + HOSTED_PATH + requestQuery(out.value.request, { testnet: isTestnet.value, decimals: out.value.asset.decimals, label: label.value.trim() || undefined })
  : ''))
function example() {
  draft.value = { ...emptyDraft(), to: 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K', amount: '2', text: 'Thanks for the coffee' }
  label.value = 'Buy me a coffee'
}

// ---------------------------------------------------------------- checkout
const { asset, error: assetError, loading: assetLoading, reload: reloadAsset } = useAsset(() => req.value?.jetton, () => link.value?.extras.decimals)
const fmt = (n: bigint) => (asset.value ? formatAsset(n, asset.value) : `${n} base units`)
const VERIFY: Record<string, { label: string, color: 'success' | 'warning' | 'error' }> = {
  known: { label: 'Well-known token', color: 'success' },
  whitelist: { label: 'Verified by tonapi', color: 'success' },
  none: { label: 'Unverified token: check the address', color: 'warning' },
  graylist: { label: 'Suspicious token', color: 'warning' },
  blacklist: { label: 'Scam token', color: 'error' }
}

const now = ref(nowSec())
const clock = setInterval(() => (now.value = nowSec()), 1000)
onBeforeUnmount(() => clearInterval(clock))
const left = computed(() => secondsLeft(req.value?.exp, now.value))

// Payment detection: the link's own `since` (invoices), else a few minutes before the page was opened, so an
// old payment with the same comment (a reused tip-jar link) does not show up as yours.
const openedAt = nowSec()
const spec = computed(() => (req.value && networkOk.value ? specFor(req.value, link.value?.extras.since ?? openedAt - 300) : null))
const watcher = usePaymentWatch(() => spec.value)
const state = watcher.state

// Amount: fixed by the link, or typed by the payer.
const typed = ref('')
const typedNano = ref<bigint | null>(null)
const amount = computed(() => req.value?.amount ?? typedNano.value)

// The payer's jetton wallet and balance, for token payments.
const jw = shallowRef<{ wallet: string | null, balance: bigint } | null>(null)
const jwError = ref<unknown>(null)
const jwLoading = ref(false)
let jwSession = 0
async function loadJettonWallet() {
  const my = ++jwSession
  jw.value = null
  jwError.value = null
  const owner = tc.wallet.value?.address
  const master = req.value?.jetton
  if (!owner || !master || !networkOk.value) return
  jwLoading.value = true
  try {
    const b = await tonapi.get<TonapiJettonBalance>(`accounts/${owner}/jettons/${master}`)
    if (my === jwSession) jw.value = { wallet: b.wallet_address.address, balance: BigInt(b.balance) }
  }
  catch (e) {
    if (my !== jwSession) return
    if ((e as { status?: number }).status === 404) jw.value = { wallet: null, balance: 0n }
    else jwError.value = e
  }
  finally {
    if (my === jwSession) jwLoading.value = false
  }
}
watch([() => tc.wallet.value?.address, () => req.value?.jetton, network], loadJettonWallet, { immediate: true })

const queryId = newQueryId()
const blocker = computed(() => {
  const r = req.value
  if (!r) return 'No payment request.'
  const b = payBlocker(r, { amount: amount.value, now: now.value, jettonBalance: jw.value?.balance })
  if (b) return b
  // A typed amount is converted with the token's decimals: never guess them.
  if (r.jetton && r.amount === undefined && !asset.value) return assetError.value ? 'Could not read the token\'s decimals, so the amount cannot be converted.' : 'Reading token info…'
  if (r.jetton && tc.wallet.value && jwLoading.value) return 'Reading your token balance…'
  if (r.jetton && tc.wallet.value && !jw.value?.wallet) return jwError.value ? 'Could not read your token balance.' : `Your wallet holds no ${asset.value?.symbol ?? 'tokens of this kind'}.`
  return null
})
const messages = computed(() => {
  const r = req.value
  if (!r || blocker.value || amount.value === null) return []
  if (r.jetton && !jw.value?.wallet) return []
  const payer = tc.wallet.value ? Address.parse(tc.wallet.value.address) : null
  return [paymentMessage(r, { amount: amount.value, payer, jettonWallet: jw.value?.wallet ?? undefined, queryId })]
})
const payLabel = computed(() => (amount.value ? `Pay ${fmt(amount.value)}` : 'Pay'))
</script>

<template>
  <div class="space-y-6">
    <UAlert v-if="invalid" color="error" variant="subtle" icon="i-lucide-circle-x" title="Invalid checkout link" description="The recipient or another parameter in this URL is not valid. Ask whoever sent it for a new link." :actions="[{ label: 'Create a checkout page', to: HOSTED_PATH, variant: 'outline' }]" />

    <!-- builder -->
    <template v-else-if="!link">
      <p class="text-sm text-muted">
        Fill in what you want to be paid. You get a link to a checkout page where anyone can pay with their wallet (TonConnect), a QR code or a wallet link, and see when the payment arrived. Nothing is stored: everything is in the link.
      </p>
      <PaymentForm v-model="draft" :result="out" expiry comment-hint="Optional; make it unique to tell payers apart" />
      <UFormField label="Title shown to the payer (optional)" hint="Not sent on chain">
        <UInput v-model="label" class="w-full" size="lg" maxlength="200" placeholder="e.g. Buy me a coffee · Invoice #42 for logo design" data-testid="label-input" />
      </UFormField>
      <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example" />

      <section v-if="shareUrl" class="space-y-3" aria-labelledby="share-h" data-testid="share-result">
        <h3 id="share-h" class="font-display text-sm font-semibold text-highlighted">
          Your checkout link
        </h3>
        <div class="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
          <PaymentQr :value="shareUrl" filename="checkout-qr" />
          <div class="min-w-0 space-y-3">
            <ResultField label="Checkout page URL" :value="shareUrl" data-testid="share-url" />
            <div class="flex flex-wrap gap-2">
              <UButton :to="shareUrl" label="Open checkout page" icon="i-lucide-external-link" data-testid="open-checkout" />
              <UButton :to="`/tools/pay-button-generator${requestQuery(out.request!, { testnet: isTestnet, decimals: out.asset.decimals, label: label.trim() || undefined })}`" label="Make a website button" icon="i-lucide-mouse-pointer-click" variant="outline" />
            </div>
            <p class="text-xs text-muted">
              This QR opens the checkout page (good for screens and print). For a QR that opens a wallet directly, use the payment link generator.
            </p>
          </div>
        </div>
      </section>
    </template>

    <!-- checkout -->
    <template v-else-if="link && req">
      <UAlert
        v-if="!networkOk"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Different network"
        :description="`This checkout is for ${linkTestnet ? 'testnet' : 'mainnet'}, but TonUtils is set to ${isTestnet ? 'testnet' : 'mainnet'}.`"
        :actions="[{ label: `Switch to ${linkTestnet ? 'testnet' : 'mainnet'}`, color: 'warning', variant: 'outline', onClick: toggle }]"
        data-testid="network-mismatch"
      />

      <div class="rounded-xl border border-default p-5" data-testid="checkout-summary">
        <p v-if="link.extras.label" class="font-display text-lg font-semibold text-highlighted">
          {{ link.extras.label }}
        </p>
        <p v-if="link.extras.label" class="text-xs text-dimmed">
          Title written by whoever made this link
        </p>
        <div class="mt-3 font-display text-3xl font-semibold text-highlighted" data-testid="checkout-amount">
          <template v-if="req.amount === undefined">
            You choose the amount
          </template>
          <template v-else>
            {{ fmt(req.amount) }}
          </template>
        </div>
        <div v-if="req.jetton" class="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span v-if="asset" class="text-muted">{{ asset.name }}</span>
          <UBadge v-if="asset" :color="VERIFY[asset.verification]?.color ?? 'neutral'" variant="subtle" :label="VERIFY[asset.verification]?.label ?? asset.verification" />
          <LoadingState v-if="assetLoading" label="Reading token info…" />
          <span class="w-full font-mono text-xs break-all text-dimmed">token {{ req.jetton }}</span>
        </div>
        <p v-if="req.text && !req.bin" class="mt-3 text-sm">
          <span class="text-muted">Comment sent with the payment:</span> <span class="font-medium">{{ req.text }}</span>
        </p>
        <p v-if="req.bin" class="mt-3 text-sm text-warning">
          Sends a binary message body instead of a comment. Check it in the transaction preview below.
        </p>
        <p v-if="left !== null" class="mt-2 text-sm" :class="left > 0 ? 'text-muted' : 'text-error'">
          {{ left > 0 ? `Expires in ${formatDuration(left)}` : 'Expired' }}
        </p>
      </div>
      <ErrorNotice v-if="assetError" :error="assetError" title="Could not read the token" @retry="reloadAsset" />
      <UAlert v-for="w in link.warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="w" data-testid="link-warning" />

      <template v-if="networkOk">
        <div>
          <h3 class="mb-2 text-sm font-medium text-highlighted">
            You are paying
          </h3>
          <RecipientCheck :address="req.to" :purpose="req.jetton ? 'jetton' : 'coin'" :comment="req.text ?? ''" />
        </div>

        <UAlert
          v-if="state.status === 'paid' || state.status === 'overpaid'"
          color="success"
          variant="subtle"
          icon="i-lucide-circle-check"
          title="Payment received"
          :description="`${fmt(state.total)} arrived at ${new Date(state.payments.at(-1)!.timestamp * 1000).toLocaleTimeString()}.`"
          data-testid="paid"
        >
          <template #actions>
            <ExplorerLinks kind="tx" :value="state.payments.at(-1)!.eventId" />
          </template>
        </UAlert>
        <UAlert v-else-if="state.status === 'pending'" color="info" variant="subtle" icon="i-lucide-loader-circle" title="Payment seen, confirming…" />
        <UAlert v-else-if="state.status === 'underpaid'" color="warning" variant="subtle" icon="i-lucide-circle-alert" :title="`Received ${fmt(state.total)}, less than requested`" />

        <section class="space-y-3" aria-labelledby="pay-h">
          <h3 id="pay-h" class="font-display text-sm font-semibold text-highlighted">
            Pay with your wallet
          </h3>
          <UAlert v-if="left !== null && left <= 0" color="error" variant="subtle" icon="i-lucide-clock-alert" description="This payment link has expired, so wallets refuse it. Ask the recipient for a new one." data-testid="expired" />
          <p v-else-if="req.jetton && !tc.wallet.value" class="text-sm text-muted">
            A token payment is sent through your own token wallet, so the transaction preview appears after you connect.
          </p>
          <AmountInput v-if="req.amount === undefined" v-model="typed" v-model:nano="typedNano" label="Amount to pay" :unit="asset?.symbol ?? 'units'" :decimals="asset?.decimals ?? 9" />
          <ErrorNotice v-if="jwError" :error="jwError" title="Could not read your token balance" @retry="loadJettonWallet" />
          <SendFlow :messages="messages" purpose="pay" :blocked="tc.wallet.value ? blocker : null" :label="payLabel" />
        </section>

        <details class="rounded-lg border border-default p-4">
          <summary class="cursor-pointer text-sm font-medium text-highlighted">
            Or pay with a QR code or wallet link
          </summary>
          <div class="mt-4 grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
            <div class="flex flex-col items-center gap-2">
              <PaymentQr :value="buildLink(req, 'ton')" filename="payment-qr" />
              <p class="max-w-56 text-center text-xs text-muted">
                Scan with your TON wallet app. Amount and comment are filled in.
              </p>
            </div>
            <PaymentLinks :request="req" :hosted="false" class="min-w-0" />
          </div>
        </details>

        <p v-if="!spec" class="text-xs text-muted">
          This link has no comment and no fixed amount, so this page cannot confirm the payment automatically. Your wallet shows the result.
        </p>
        <p v-else-if="state.status === 'waiting'" class="text-xs text-muted">
          This page checks for the payment every 10 seconds{{ watcher.lastChecked.value ? ` (last check ${new Date(watcher.lastChecked.value).toLocaleTimeString()})` : '' }}.
        </p>
        <ErrorNotice v-if="watcher.error.value" :error="watcher.error.value" title="Could not check for the payment" @retry="watcher.check()" />
        <p class="text-xs text-muted">
          TonUtils never holds the money: it goes straight from your wallet to the address above. Always check the recipient before you approve.
        </p>
      </template>
    </template>
  </div>
</template>
