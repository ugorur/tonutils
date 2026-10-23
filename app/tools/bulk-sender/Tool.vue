<script setup lang="ts">
import { Address } from '@ton/core'
import { balanceNote, feeReserve } from '~/lib/bulk-actions/fees'
import type { CheckedRow } from '~/lib/bulk-actions/recipients'
import { totals } from '~/lib/bulk-actions/recipients'
import RecipientsEditor from '~/lib/bulk-actions/RecipientsEditor.vue'
import { maxMessages } from '~/lib/wallet-actions/core'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { buildBulkTonMessages } from './logic'

// Real mainnet wallets (two W5, the old TON Foundation v3R2 wallet typed in bounceable form).
const EXAMPLE = [
  'address,amount,comment',
  'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,0.05,Thanks for the help!',
  'UQAo3g29hBMLks-zHVi4tpIL9JDW7-v6AZJ-su7wXAhiXFqP,0.02,"Welcome bonus, round 1"',
  'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N,0.01'
].join('\n')

const tc = useTonConnect()
const toncenter = useToncenter(useTonNetwork().network)
const text = ref('')
const rows = shallowRef<CheckedRow[]>([])
// Keyed on the address string so a TonConnect status event for the same wallet does not rebuild the messages
// (that would reset the batch states in SendFlow mid-run).
const selfRaw = computed(() => tc.wallet.value?.address)
const self = computed(() => (selfRaw.value ? Address.parse(selfRaw.value) : null))

const messages = computed(() => buildBulkTonMessages(rows.value))
const sum = computed(() => totals(rows.value))
const perRequest = computed(() => maxMessages(tc.wallet.value?.device.features))
const approvals = computed(() => Math.ceil(messages.value.length / perRequest.value))

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

const reserve = computed(() => feeReserve(messages.value.length, perRequest.value))
const note = computed(() => balanceNote(balance.value, sum.value.amount, reserve.value))
const blocked = computed(() => {
  if (!rows.value.length) return 'Add recipients above.'
  if (sum.value.blocked) return `${sum.value.blocked} of ${sum.value.rows} rows need attention (see the Check column). Fix or remove them: the list is sent complete or not at all.`
  if (note.value?.level === 'error') return note.value.text
  return null
})
</script>

<template>
  <div class="space-y-6">
    <RecipientsEditor v-model="text" purpose="coin" :decimals="COIN_DECIMALS" :unit="COIN_SYMBOL" :self="self" :example="EXAMPLE" @rows="rows = $event" />

    <section v-if="messages.length" class="space-y-2 rounded-lg border border-default p-4 text-sm" data-testid="bulk-summary">
      <h3 class="font-display font-semibold text-highlighted">
        Summary
      </h3>
      <p>
        {{ messages.length }} {{ messages.length === 1 ? 'transfer' : 'transfers' }}, <TokenAmount :nano="sum.amount" /> in total, plus network fees (roughly <TokenAmount :nano="reserve" :max-decimals="3" />).
      </p>
      <p class="text-muted">
        <template v-if="tc.wallet.value">
          Your wallet ({{ tc.wallet.value.walletName }}) accepts {{ perRequest }} messages per approval, so this takes {{ approvals }} {{ approvals === 1 ? 'approval' : 'approvals' }}.
        </template>
        <template v-else>
          W5 wallets accept up to 255 messages per approval, older wallets (v4, v3) 4. Connect to see the exact number.
        </template>
        Each batch is signed after the previous one is confirmed on chain. Keep this page open until the last one is done: if you close it, check your history in an explorer before sending again, so nobody is paid twice.
      </p>
      <p v-if="balance !== null">
        Wallet balance <TokenAmount :nano="balance" :max-decimals="4" />
      </p>
      <UAlert v-if="note" :color="note.level === 'error' ? 'error' : 'warning'" variant="subtle" icon="i-lucide-triangle-alert" :description="note.text" />
      <ErrorNotice v-if="balanceError" :error="balanceError" title="Could not read your balance" @retry="loadBalance" />
    </section>

    <SendFlow
      :messages="messages"
      :purpose="`send ${COIN_SYMBOL} to the list`"
      :label="`Send ${COIN_SYMBOL} to ${messages.length} ${messages.length === 1 ? 'recipient' : 'recipients'}`"
      :blocked="blocked"
      confirm="I checked the addresses and amounts. Transfers cannot be reversed."
    />
  </div>
</template>
