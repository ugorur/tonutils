<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { OwnedJetton, Recipient } from '~/lib/wallet-actions/core'
import { fetchJettons, newQueryId, NO_MEMO_CONFIRM, TOKEN_GAS } from '~/lib/wallet-actions/core'
import JettonList from '~/lib/wallet-actions/JettonList.vue'
import OwnerBar from '~/lib/wallet-actions/OwnerBar.vue'
import RecipientInput from '~/lib/wallet-actions/RecipientInput.vue'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { KNOWN_JETTONS } from '~/utils/ton/jetton'
import { buildJettonSend, sendProblems, spendable } from './logic'

// TON Foundation's wallet: holds verified tokens (DOGS, jUSDT …) and plenty of spam, good for a preview.
const EXAMPLE_OWNER = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'
const DOGS = Address.parse(KNOWN_JETTONS.find(j => j.symbol === 'DOGS')!.master).toRawString()

const tonapi = useTonapi()
const toncenter = useToncenter()
const { network } = useTonNetwork()

const owner = shallowRef<Address | null>(null)
const jettons = ref<OwnedJetton[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
const coinBalance = ref<bigint | null>(null)
const selected = ref<string[]>([])
/** Token to select once the list loads (set by the example). */
let pendingPick: string | null = null
let session = 0

async function load() {
  const my = ++session
  jettons.value = []
  coinBalance.value = null
  error.value = null
  const o = owner.value
  if (!o) return
  loading.value = true
  try {
    const [list, bal] = await Promise.all([
      fetchJettons(tonapi.get, o),
      toncenter.v2<string>('getAddressBalance', { address: o.toRawString() }).then(BigInt).catch(() => null)
    ])
    if (my !== session) return
    jettons.value = list
    coinBalance.value = bal
    if (!list.some(j => j.master === selected.value[0])) selected.value = pendingPick && list.some(j => j.master === pendingPick) ? [pendingPick] : []
    pendingPick = null
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
watch([owner, network], load)

const jetton = computed(() => jettons.value.find(j => j.master === selected.value[0]) ?? null)
const to = ref('')
const recipient = shallowRef<Recipient | null>(null)
const amountText = ref('')
const amount = ref<bigint | null>(null)
const comment = ref('')
const queryId = newQueryId()

const problems = computed(() => (jetton.value ? sendProblems(jetton.value, amount.value, { coinBalance: coinBalance.value, destination: recipient.value?.address }) : []))
const messages = computed<TonConnectMessage[]>(() => {
  const j = jetton.value
  const r = recipient.value
  if (!j || !owner.value || !r || r.blocked || amount.value === null || problems.value.some(p => p.level === 'error')) return []
  return [buildJettonSend({ jettonWallet: j.wallet, owner: owner.value, destination: r.address, amount: amount.value, comment: comment.value, queryId })]
})

function setMax() {
  if (jetton.value) amountText.value = formatUnits(spendable(jetton.value), jetton.value.decimals)
}

function example() {
  if (jettons.value.some(j => j.master === DOGS)) selected.value = [DOGS]
  else pendingPick = DOGS
  to.value = 'foundation.ton'
  amountText.value = '100'
  comment.value = 'Thanks!'
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3" aria-labelledby="sj-owner">
      <h3 id="sj-owner" class="font-display text-sm font-semibold text-highlighted">
        1. Token
      </h3>
      <OwnerBar v-model:owner="owner" :example="EXAMPLE_OWNER" example-label="Try an example (TON Foundation's tokens)" @example="example" />
      <LoadingState v-if="loading" label="Loading tokens…" />
      <ErrorNotice v-if="error" :error="error" title="Could not load the tokens" @retry="load" />
      <JettonList v-if="owner && !loading && !error" v-model:selected="selected" :jettons="jettons" />
    </section>

    <section v-if="jetton" class="space-y-4 border-t border-default pt-5" aria-labelledby="sj-send">
      <h3 id="sj-send" class="font-display text-sm font-semibold text-highlighted">
        2. Send {{ jetton.symbol }}
      </h3>
      <RecipientInput v-model="to" purpose="jetton" :comment="comment" :self="owner" @resolved="recipient = $event" />

      <div class="space-y-1.5">
        <AmountInput v-model="amountText" v-model:nano="amount" :label="`Amount (${jetton.symbol})`" :unit="jetton.symbol" :decimals="jetton.decimals" />
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Available <TokenAmount :nano="spendable(jetton)" :decimals="jetton.decimals" :symbol="jetton.symbol" /></span>
          <UButton label="Max" size="xs" variant="outline" color="neutral" @click="setMax" />
          <span v-if="coinBalance !== null">· Fee balance <TokenAmount :nano="coinBalance" :max-decimals="3" /></span>
        </div>
      </div>

      <UFormField label="Comment (optional)" hint="Memo / tag for exchanges">
        <UTextarea v-model="comment" :rows="2" autoresize class="w-full" placeholder="e.g. your exchange deposit memo" />
        <template #help>
          Public, readable by anyone. {{ formatCoin(TOKEN_GAS) }} is attached for fees; what is not used comes back to you.
        </template>
      </UFormField>

      <UAlert
        v-for="(p, i) in problems"
        :key="i"
        :color="p.level === 'error' ? 'error' : 'warning'"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="p.text"
      />
    </section>

    <SendFlow v-if="jetton" :messages="messages" purpose="send tokens" :label="`Send ${jetton.symbol}`" :confirm="recipient?.account?.memo_required && !comment.trim() ? NO_MEMO_CONFIRM : undefined" />
  </div>
</template>
