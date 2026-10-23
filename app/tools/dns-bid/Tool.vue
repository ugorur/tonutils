<script setup lang="ts">
import type { TonConnectMessage, TonTrace } from '~/composables/useTonConnect'
import type { DomainLookup } from '~/lib/dns-write/dns'
import { domainStatus, firstAuctionDuration, fmtDate, lookupDomain, normalizeDomain, relativeTime } from '~/lib/dns-write/dns'
import DomainCard from '~/lib/dns-write/DomainCard.vue'
import { bidAction, bidMessage } from './logic'

// fire.ton: released 2026-10-15 into a 1-week auction (100 GRAM top bid). A long random name is almost surely free.
const EXAMPLES = ['fire.ton', 'gram-toolbox-example.ton']

const route = useRoute()
const tc = useToncenter()
const ton = useTonConnect()
const { network, isTestnet } = useTonNetwork()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const check = computed(() => (input.value.trim() ? normalizeDomain(input.value) : null))
const fragment = computed(() => (check.value && !check.value.ok && check.value.fragment ? check.value.error : null))
const nameError = computed(() => (check.value && !check.value.ok && !check.value.fragment ? check.value.error : undefined))
const now = ref(Math.floor(Date.now() / 1000))
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 1000)
  if (input.value) nextTick(lookup)
})
onBeforeUnmount(() => clearInterval(timer))

const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<DomainLookup | null>(null)
let session = 0

async function lookup() {
  const c = check.value
  if (!c?.ok) return
  const my = ++session
  loading.value = true
  error.value = null
  sent.value = null
  sendError.value = null
  try {
    const r = await lookupDomain(tc.v3, network.value, c.name)
    if (my === session) result.value = r
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example(name: string) {
  input.value = name
  result.value = null
  nextTick(lookup)
}

watch(network, () => {
  session++
  result.value = null
  error.value = null
})

const status = computed(() => (result.value ? domainStatus(result.value.item, now.value) : null))
const action = computed(() => (result.value && status.value ? bidAction(result.value, status.value, network.value, now.value) : null))
const leading = computed(() => {
  const s = status.value
  const w = ton.wallet.value
  return !!(s?.kind === 'auction' && w && s.auction.maxBidder?.toRawString() === w.address.toLowerCase())
})
// The owner of an expired domain renews it; releasing it would put their own domain up for auction.
const ownExpired = computed(() => {
  const s = status.value
  const w = ton.wallet.value
  return !!(s?.kind === 'expired' && w && s.owner?.toRawString() === w.address.toLowerCase())
})

// ---------------------------------------------------------------- amount + send
const amountText = ref('')
const amount = ref<bigint | null>(null)
const confirmed = ref(false)
// Reset the amount to the minimum when the action or its minimum changes (a new bid raises it).
watch(() => action.value && `${action.value.kind}:${action.value.min}`, () => {
  if (action.value) amountText.value = formatUnits(action.value.min)
  confirmed.value = false
}, { immediate: true })
// A changed amount needs a fresh confirmation.
watch(amount, () => (confirmed.value = false))

const amountError = computed(() => (action.value && amount.value !== null && amount.value < action.value.min
  ? `At least ${formatCoin(action.value.min)}; a lower amount is rejected and bounced back.`
  : null))
const messages = computed<TonConnectMessage[]>(() => {
  if (!action.value || !result.value || amount.value === null || amountError.value || ownExpired.value) return []
  return [bidMessage(action.value, result.value.name, amount.value)]
})

const sending = ref(false)
const sendError = ref<unknown>(null)
const sent = shallowRef<{ hash: string, trace: TonTrace | null } | null>(null)

async function send() {
  if (!messages.value.length || !confirmed.value) return
  sending.value = true
  sendError.value = null
  try {
    const r = await ton.sendTransaction({ messages: messages.value })
    sent.value = { hash: r.hash, trace: null }
    const trace = await ton.waitForTransaction(r.hash)
    sent.value = { hash: r.hash, trace }
    await lookup()
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = false
  }
}

const BUTTON = { start: 'Start auction in wallet', bid: 'Place bid in wallet', release: 'Release and bid in wallet' }
const PURPOSE = { start: 'start the auction', bid: 'place a bid', release: 'release the domain' }
const lengthNote = computed(() => {
  const n = result.value?.name.length ?? 0
  return n >= 11 ? '11+ character names' : `${n}-character names`
})
const prolongation = computed(() => (isTestnet.value ? 'the last minutes' : 'the last hour'))
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="lookup">
      <UFormField label=".ton domain" :error="nameError" :hint="check?.ok && !input.toLowerCase().includes(check.name) ? `On chain: ${check.name}.ton` : undefined">
        <UInput v-model="input" placeholder="alice.ton" size="lg" class="w-full" autocomplete="off" autocapitalize="off" spellcheck="false" :ui="{ base: 'font-mono text-sm' }" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UButton type="submit" label="Check domain" icon="i-lucide-search" :loading="loading" :disabled="!check?.ok" />
        <span class="text-xs text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e" :label="e" variant="link" size="sm" class="px-0" @click="example(e)" />
      </div>
      <p class="text-xs text-muted">
        Names are 4–126 characters of a–z, 0–9 and hyphens. Other alphabets are converted to punycode (xn--…), as browsers do.
      </p>
    </form>

    <UAlert
      v-if="fragment"
      color="info"
      variant="subtle"
      icon="i-lucide-send"
      title="Sold on Fragment"
      :description="fragment"
      :actions="[{ label: 'Open fragment.com', to: 'https://fragment.com', target: '_blank', color: 'info', variant: 'outline', trailingIcon: 'i-lucide-external-link' }]"
    />

    <LoadingState v-if="loading && !result" label="Reading the domain from the blockchain…" />
    <ErrorNotice :error="error" title="Could not read the domain" @retry="lookup" />

    <template v-if="result && status">
      <DomainCard :lookup="result" :status="status" :now="now" />

      <UAlert v-if="status.kind === 'owned'" color="neutral" variant="subtle" icon="i-lucide-lock" title="This domain is taken" :description="`It is registered until ${fmtDate(status.expiresAt)} as long as the owner keeps renewing it. You can only buy it from the owner, for example if it is listed on an NFT marketplace.`" />
      <UAlert v-else-if="status.kind === 'won'" color="neutral" variant="subtle" icon="i-lucide-flag" title="The auction is over" description="The winner receives the domain with their first action on it (for example renewing it or setting a record). No more bids are accepted." />

      <section v-if="action" class="space-y-4 border-t border-default pt-5" aria-labelledby="bid-h">
        <h3 id="bid-h" class="font-display text-sm font-semibold text-highlighted">
          {{ action.kind === 'start' ? 'Start the auction' : action.kind === 'bid' ? 'Place a bid' : 'Release and start a new auction' }}
        </h3>

        <div class="space-y-1.5 text-sm text-muted">
          <template v-if="action.kind === 'start'">
            <p>
              Nobody has bid on this name yet. Opening the auction costs at least <TokenAmount :nano="action.min" /> for {{ lengthNote }}, and that amount, minus a few thousandths of a {{ COIN_SYMBOL }} the collection spends on gas, becomes the first bid.
              The auction then runs for {{ isTestnet ? 'a few minutes' : `${Math.round(firstAuctionDuration(now) / 3600)} hour` }}; a bid in {{ prolongation }} moves the end to one hour after it.
            </p>
            <p>If someone starts it in the same moment, your message reaches an existing auction and the {{ COIN_SYMBOL }} is sent back.</p>
          </template>
          <template v-else-if="action.kind === 'bid'">
            <p>
              A new bid must be at least 5% above the top bid: <TokenAmount :nano="action.min" /> or more. When someone outbids you, the domain contract sends your bid back automatically.
              A bid in {{ prolongation }} moves the end to one hour after it.
            </p>
          </template>
          <template v-else>
            <p>
              Nobody renewed this domain for over a year. The owner can still renew it until someone releases it. Releasing costs at least <TokenAmount :nano="action.min" /> for {{ lengthNote }},
              makes you the first bidder of a new 1-week auction, and sends the domain's balance above 1 {{ COIN_SYMBOL }} to the previous owner.
            </p>
          </template>
        </div>

        <UAlert v-if="leading" color="success" variant="subtle" icon="i-lucide-trophy" title="You are the top bidder" description="Your connected wallet holds the top bid. Bidding again raises your own bid; the previous one is refunded." />

        <WalletGate :purpose="PURPOSE[action.kind]">
          <UAlert
            v-if="ownExpired"
            color="warning"
            variant="subtle"
            icon="i-lucide-calendar-sync"
            title="This is your domain"
            description="Your connected wallet still owns it. Renew it now instead of releasing it: releasing would start a public auction for your own domain."
            :actions="[{ label: 'Renew it', to: '/tools/dns-renew', color: 'warning', variant: 'outline' }]"
          />
          <div v-else class="space-y-4">
            <div class="max-w-sm">
              <AmountInput v-model="amountText" v-model:nano="amount" :label="action.kind === 'start' ? 'Opening bid' : 'Your bid'" />
              <p v-if="amountError" class="mt-1 text-sm text-error">
                {{ amountError }}
              </p>
              <p v-else class="mt-1 text-xs text-muted">
                Minimum <TokenAmount :nano="action.min" />. The whole amount is your bid; the network fee is paid on top.
              </p>
            </div>

            <template v-if="messages.length">
              <TxPreview :messages="messages" />
              <UCheckbox
                v-model="confirmed"
                :label="action.kind === 'bid'
                  ? 'I understand my bid stays locked until I am outbid (then it is refunded) or I win (then it pays for the domain).'
                  : 'I understand this amount is my bid: it pays for the domain if I win and is refunded only if someone outbids me.'"
              />
              <div class="flex flex-wrap items-center gap-3">
                <UButton :label="BUTTON[action.kind]" icon="i-lucide-gavel" :loading="sending" :disabled="!confirmed" @click="send" />
                <UButton label="Refresh state" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="loading" @click="lookup" />
              </div>
            </template>
            <ErrorNotice :error="sendError" title="Not sent" />
            <div v-if="sent" class="space-y-2 rounded-lg border border-success/40 p-4 text-sm" data-testid="bid-sent">
              <p v-if="!sent.trace" class="text-muted">
                Sent. Waiting for the network to process it…
              </p>
              <template v-else>
                <p class="font-medium text-success">
                  Processed. The state above is refreshed; if your bid was too low or late it was bounced back.
                </p>
                <ExplorerLinks kind="tx" :value="sent.trace.external_hash" />
              </template>
            </div>
          </div>
        </WalletGate>
      </section>

      <p v-if="status.kind === 'auction'" class="text-xs text-muted">
        Ends {{ relativeTime(status.auction.endTime, now) }}. Values are read live from the domain contract; press Check again for new bids.
      </p>
    </template>
  </div>
</template>
