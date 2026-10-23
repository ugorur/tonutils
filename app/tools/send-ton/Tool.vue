<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { Recipient } from '~/lib/wallet-actions/core'
import RecipientInput from '~/lib/wallet-actions/RecipientInput.vue'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { NO_MEMO_CONFIRM } from '~/lib/wallet-actions/core'
import { amountProblem, buildTonTransfer, FEE_RESERVE, maxSendable } from './logic'

const route = useRoute()
const tc = useTonConnect()
const toncenter = useToncenter()
const q = (k: string) => (typeof route.query[k] === 'string' ? route.query[k] as string : '')

// Prefill from ?to=&amount=&text= (same names as ton://transfer links).
const to = ref(q('to'))
const amountText = ref(q('amount'))
const amount = ref<bigint | null>(null)
const comment = ref(q('text'))
const recipient = shallowRef<Recipient | null>(null)

const self = computed(() => (tc.wallet.value ? Address.parse(tc.wallet.value.address) : null))
const balance = ref<bigint | null>(null)
const balanceError = ref<unknown>(null)
async function loadBalance() {
  balance.value = null
  balanceError.value = null
  const w = tc.wallet.value
  if (!w || tc.networkMismatch.value) return
  try {
    balance.value = BigInt(await toncenter.v2<string>('getAddressBalance', { address: w.address }))
  }
  catch (e) {
    balanceError.value = e
  }
}
watch([() => tc.wallet.value?.address, tc.networkMismatch], loadBalance, { immediate: true })

const problem = computed(() => amountProblem(amount.value, balance.value))
const messages = computed<TonConnectMessage[]>(() => {
  const r = recipient.value
  if (!r || r.blocked || amount.value === null || problem.value?.level === 'error') return []
  return [buildTonTransfer({ destination: r.destination, amount: amount.value, comment: comment.value })]
})

function setMax() {
  if (balance.value !== null) amountText.value = formatUnits(maxSendable(balance.value))
}

function example() {
  to.value = 'foundation.ton'
  amountText.value = '0.1'
  comment.value = 'Hello from TonUtils'
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-4">
      <RecipientInput v-model="to" purpose="coin" :comment="comment" :self="self" @resolved="recipient = $event" />

      <div class="space-y-1.5">
        <AmountInput v-model="amountText" v-model:nano="amount" :label="`Amount (${COIN_SYMBOL})`" />
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <template v-if="balance !== null">
            <span>Balance <TokenAmount :nano="balance" :max-decimals="4" /></span>
            <UButton label="Max" size="xs" variant="outline" color="neutral" @click="setMax" />
            <span>keeps {{ formatCoin(FEE_RESERVE) }} for fees</span>
          </template>
          <span v-else-if="!tc.wallet.value">1 {{ COIN_SYMBOL }} = 1,000,000,000 {{ NANO_NAME }} (formerly {{ NANO_FORMER }}).</span>
        </div>
        <UAlert v-if="problem" :color="problem.level === 'error' ? 'error' : 'warning'" variant="subtle" icon="i-lucide-triangle-alert" :description="problem.text" />
        <ErrorNotice v-if="balanceError" :error="balanceError" title="Could not read your balance" @retry="loadBalance" />
      </div>

      <UFormField label="Comment (optional)" hint="Memo / tag for exchanges">
        <UTextarea v-model="comment" :rows="2" autoresize class="w-full" placeholder="e.g. your exchange deposit memo" data-testid="comment-input" />
        <template #help>
          Comments are public: anyone can read them on chain. Encrypted comments are not offered here, because TonConnect cannot encrypt with your wallet's key.
        </template>
      </UFormField>

      <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example" />
    </div>

    <SendFlow :messages="messages" :purpose="`send ${COIN_SYMBOL}`" :label="`Send ${COIN_SYMBOL}`" :confirm="recipient?.account?.memo_required && !comment.trim() ? NO_MEMO_CONFIRM : undefined" />
  </div>
</template>
