<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { OwnedJetton } from '~/lib/wallet-actions/core'
import { fetchJettons, newQueryId, TOKEN_GAS } from '~/lib/wallet-actions/core'
import JettonList from '~/lib/wallet-actions/JettonList.vue'
import OwnerBar from '~/lib/wallet-actions/OwnerBar.vue'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { buildBurn, burnPlan } from './logic'

// TON Foundation's wallet collects a lot of airdropped spam: a realistic preview.
const EXAMPLE_OWNER = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'

const tonapi = useTonapi()
const toncenter = useToncenter()
const { network } = useTonNetwork()

const owner = shallowRef<Address | null>(null)
const jettons = ref<OwnedJetton[]>([])
const loading = ref(false)
const error = ref<unknown>(null)
const coinBalance = ref<bigint | null>(null)
const selected = ref<string[]>([])
let pickSpam = false
let session = 0

const spam = computed(() => jettons.value.filter(j => j.verification === 'blacklist' && j.balance > 0n && !j.needsClaim))

async function load() {
  const my = ++session
  jettons.value = []
  selected.value = []
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
    if (pickSpam) selectSpam(3)
    pickSpam = false
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
watch([owner, network], load)

function selectSpam(limit = Infinity) {
  selected.value = spam.value.slice(0, limit).map(j => j.master)
}

function example() {
  if (jettons.value.length) selectSpam(3)
  else pickSpam = true
}

const chosen = computed(() => jettons.value.filter(j => selected.value.includes(j.master)))
const single = computed(() => (chosen.value.length === 1 ? chosen.value[0]! : null))
const amountText = ref('')
const amount = ref<bigint | null>(null)
watch(single, (j) => {
  amountText.value = j ? formatUnits(j.balance - j.locked, j.decimals) : ''
})

const queryId = newQueryId()
const plan = computed(() => burnPlan(chosen.value, { coinBalance: coinBalance.value, customAmount: single.value ? amount.value : undefined }))
const messages = computed<TonConnectMessage[]>(() => {
  const o = owner.value
  if (!o || plan.value.notes.some(n => n.level === 'error')) return []
  return plan.value.items.map((it, i) => buildBurn({ jettonWallet: it.jetton.wallet, owner: o, amount: it.amount, queryId: queryId + BigInt(i) }))
})
const confirmText = computed(() => `I understand that burning ${plan.value.items.length === 1 ? 'this token' : `these ${plan.value.items.length} tokens`} is permanent and cannot be undone.`)
</script>

<template>
  <div class="space-y-6">
    <UAlert color="info" variant="subtle" icon="i-lucide-shield-alert" title="Spam tokens are bait">
      <template #description>
        Airdropped tokens with names like "Claim at …" or "GRAM unlock" lead to sites that drain wallets. Never open their links. Burning removes them from your wallet; hiding them in your wallet app is free and works too. Burning needs {{ formatCoin(TOKEN_GAS) }} per token attached for fees: a normal token returns most of it, a malicious token contract may keep it.
      </template>
    </UAlert>

    <section class="space-y-3" aria-labelledby="bj-pick">
      <h3 id="bj-pick" class="font-display text-sm font-semibold text-highlighted">
        1. Choose tokens to burn
      </h3>
      <OwnerBar v-model:owner="owner" :example="EXAMPLE_OWNER" example-label="Try an example (TON Foundation's spam)" @example="example" />
      <LoadingState v-if="loading" label="Loading tokens…" />
      <ErrorNotice v-if="error" :error="error" title="Could not load the tokens" @retry="load" />
      <template v-if="owner && !loading && !error">
        <div v-if="spam.length" class="flex flex-wrap items-center gap-2 text-sm">
          <UButton :label="`Select all spam (${spam.length})`" icon="i-lucide-list-checks" size="sm" variant="outline" color="neutral" @click="selectSpam()" />
          <UButton v-if="selected.length" label="Clear" size="sm" variant="ghost" color="neutral" @click="selected = []" />
        </div>
        <JettonList v-model:selected="selected" :jettons="jettons" multiple show-spam />
      </template>
    </section>

    <section v-if="chosen.length" class="space-y-3 border-t border-default pt-5" aria-labelledby="bj-review">
      <h3 id="bj-review" class="font-display text-sm font-semibold text-highlighted">
        2. Review
      </h3>
      <AmountInput v-if="single" v-model="amountText" v-model:nano="amount" :label="`Amount to burn (${single.symbol})`" :unit="single.symbol" :decimals="single.decimals" />
      <ul v-else class="space-y-1 text-sm">
        <li v-for="it in plan.items" :key="it.jetton.master" class="flex flex-wrap justify-between gap-2">
          <span class="font-medium text-highlighted">{{ it.jetton.symbol }} <span class="font-normal text-muted">{{ it.jetton.name }}</span></span>
          <TokenAmount :nano="it.amount" :decimals="it.jetton.decimals" :symbol="it.jetton.symbol" :max-decimals="4" />
        </li>
      </ul>
      <UAlert
        v-for="(n, i) in plan.notes"
        :key="i"
        :color="n.level === 'error' ? 'error' : 'warning'"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :description="n.text"
      />
    </section>

    <SendFlow
      v-if="chosen.length"
      :messages="messages"
      purpose="burn tokens"
      :confirm="confirmText"
      :label="`Burn ${plan.items.length === 1 ? plan.items[0]!.jetton.symbol : `${plan.items.length} tokens`}`"
    />
  </div>
</template>
