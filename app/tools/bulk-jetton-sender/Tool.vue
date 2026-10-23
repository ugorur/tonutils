<script setup lang="ts">
import { Address } from '@ton/core'
import { balanceNote, feeReserve } from '~/lib/bulk-actions/fees'
import type { CheckedRow } from '~/lib/bulk-actions/recipients'
import { totals } from '~/lib/bulk-actions/recipients'
import RecipientsEditor from '~/lib/bulk-actions/RecipientsEditor.vue'
import type { OwnedJetton } from '~/lib/wallet-actions/core'
import { fetchJettons, maxMessages, newQueryId } from '~/lib/wallet-actions/core'
import OwnerBar from '~/lib/wallet-actions/OwnerBar.vue'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { formatJettonAmount, USDT_MASTER } from '~/utils/ton/jetton'
import { ATTACHED, buildBulkJettonMessages, jettonNotes } from './logic'

// Preview owner: a real mainnet v4R2 wallet holding USD₮ and other jettons. Recipients: real mainnet wallets.
const EXAMPLE_OWNER = 'UQAb-BAv6qky3RZ9WDZW3ueqUddNskuaVpNt9hByhbI74hZ3'
const EXAMPLE = [
  'address,amount,comment',
  'UQBiFVQmRPl1S3TSPjCwCQV3p3WEP6g-LP_Tk-Gw96SDlC0m,0.1,October reward',
  'UQAo3g29hBMLks-zHVi4tpIL9JDW7-v6AZJ-su7wXAhiXFqP,0.25,"Bug bounty, round 2"',
  'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI,0.05'
].join('\n')

const USDT_RAW = Address.parse(USDT_MASTER).toRawString()

const tc = useTonConnect()
const { isTestnet, network } = useTonNetwork()
const tonapi = useTonapi(network)
const toncenter = useToncenter(network)

const owner = shallowRef<Address | null>(null)
const text = ref('')
const rows = shallowRef<CheckedRow[]>([])

const jettons = ref<OwnedJetton[]>([])
const selected = ref<string>('')
const gram = ref<bigint | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)
let session = 0

async function load() {
  const my = ++session
  jettons.value = []
  gram.value = null
  loadError.value = null
  const o = owner.value
  if (!o) return
  loading.value = true
  try {
    const raw = o.toRawString()
    const [r, bal] = await Promise.all([
      fetchJettons(tonapi.get, o),
      toncenter.v2<string>('getAddressBalance', { address: raw })
    ])
    if (my !== session) return
    jettons.value = r.filter(j => j.balance > 0n)
    gram.value = BigInt(bal)
    const usdt = jettons.value.find(j => j.master === USDT_RAW)
    if (!jettons.value.some(j => j.master === selected.value)) selected.value = (usdt ?? jettons.value[0])?.master ?? ''
  }
  catch (e) {
    if (my === session) loadError.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
watch(owner, load)

const jetton = computed(() => jettons.value.find(j => j.master === selected.value) ?? null)
const items = computed(() => jettons.value.map(j => ({
  label: `${j.symbol} · ${formatJettonAmount(j.balance, j.decimals, { maxDecimals: 4 })}${j.verification === 'blacklist' ? ' (scam)' : ''}`,
  value: j.master
})))

const sum = computed(() => totals(rows.value))
const messages = computed(() => {
  const j = jetton.value
  const o = owner.value
  if (!j || !o) return []
  return buildBulkJettonMessages({ rows: rows.value, jettonWallet: j.wallet, owner: o, testnet: isTestnet.value, queryId0: newQueryId() })
})
const tokenNotes = computed(() => (jetton.value ? jettonNotes(jetton.value, sum.value.amount) : []))
const perRequest = computed(() => maxMessages(tc.wallet.value?.device.features))
// Per row, not per built message: the summary shows the GRAM needed even while a row still blocks the send.
const attached = computed(() => ATTACHED * BigInt(sum.value.rows))
const reserve = computed(() => feeReserve(sum.value.rows, perRequest.value))
const gramNote = computed(() => balanceNote(gram.value, attached.value, reserve.value))
const isPreview = computed(() => !tc.wallet.value || tc.networkMismatch.value)

const blocked = computed(() => {
  if (!jetton.value) return 'Choose a token above.'
  if (!rows.value.length) return 'Add recipients above.'
  if (sum.value.blocked) return `${sum.value.blocked} of ${sum.value.rows} rows need attention (see the Check column). Fix or remove them: the list is sent complete or not at all.`
  const err = [...tokenNotes.value, gramNote.value].find(n => n?.level === 'error')
  return err?.text ?? null
})
</script>

<template>
  <div class="space-y-6">
    <OwnerBar v-model:owner="owner" :example="EXAMPLE_OWNER" example-label="Try an example (a mainnet wallet holding USD₮)" @example="text = EXAMPLE" />

    <LoadingState v-if="loading" label="Loading tokens…" />
    <ErrorNotice v-else-if="loadError" :error="loadError" title="Could not load the tokens" @retry="load" />
    <UAlert v-else-if="owner && !jettons.length" color="neutral" variant="subtle" icon="i-lucide-info" description="This wallet holds no tokens on this network." />

    <template v-if="jetton">
      <UFormField label="Token to send">
        <USelect v-model="selected" :items="items" class="w-full sm:w-96" data-testid="jetton-select" />
        <template #help>
          Each transfer goes from your jetton wallet with {{ formatCoin(ATTACHED) }} attached for gas; the unused part comes back to you.
        </template>
      </UFormField>

      <RecipientsEditor v-model="text" purpose="jetton" :decimals="jetton.decimals" :unit="jetton.symbol" :self="owner" :example="EXAMPLE" @rows="rows = $event" />

      <section v-if="rows.length" class="space-y-2 rounded-lg border border-default p-4 text-sm" data-testid="bulk-summary">
        <h3 class="font-display font-semibold text-highlighted">
          Summary
        </h3>
        <p>
          {{ sum.rows }} {{ sum.rows === 1 ? 'transfer' : 'transfers' }}, <TokenAmount :nano="sum.amount" :decimals="jetton.decimals" :symbol="jetton.symbol" /> in total.
          Attached for gas: <TokenAmount :nano="attached" /> ({{ formatCoin(ATTACHED) }} each, most of it returns as excess), plus network fees.
        </p>
        <p class="text-muted">
          <template v-if="!isPreview">
            Your wallet accepts {{ perRequest }} messages per approval, so this takes {{ Math.ceil(sum.rows / perRequest) }} {{ Math.ceil(sum.rows / perRequest) === 1 ? 'approval' : 'approvals' }}.
          </template>
          <template v-else>
            W5 wallets accept up to 255 transfers per approval, older wallets (v4, v3) 4.
          </template>
          Keep this page open until the last batch is confirmed; if you close it, check your history before sending again.
        </p>
        <p v-if="gram !== null">
          Balance: <TokenAmount :nano="jetton.balance" :decimals="jetton.decimals" :symbol="jetton.symbol" /> and <TokenAmount :nano="gram" :max-decimals="4" />
        </p>
        <UAlert
          v-for="(n, i) in [...tokenNotes, ...(gramNote ? [gramNote] : [])]"
          :key="i"
          :color="n.level === 'error' ? 'error' : n.level === 'warning' ? 'warning' : 'info'"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="n.text"
        />
      </section>

      <SendFlow
        :messages="messages"
        :purpose="`send ${jetton.symbol} to the list`"
        :label="`Send ${jetton.symbol} to ${sum.rows} ${sum.rows === 1 ? 'recipient' : 'recipients'}`"
        :blocked="blocked"
        confirm="I checked the addresses and amounts. Token transfers cannot be reversed."
      />
    </template>
  </div>
</template>
