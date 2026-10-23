<script setup lang="ts">
import { Address } from '@ton/core'
import { runGetMethod, stackNum } from '~/lib/staking/pools'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { ACTION_VALUE, changeValidatorBody, ELECTOR, parseRoles, STORAGE_RESERVE, validatorStake, withdrawable, withdrawBody } from './logic'

// A live mainnet single nominator pool (found among current validators; get_roles succeeds).
const EXAMPLE = '-1:c77f91f1bd9f779c12346dcea875a6eca9d6506ce3aa3aa91e2d8595b6088e74'

const route = useRoute()
const api = useTonapi()
const toncenter = useToncenter()
const tc = useTonConnect()
const { isTestnet } = useTonNetwork()

const text = ref(typeof route.query.address === 'string' ? route.query.address : '')
const addr = shallowRef<Address | null>(null)
interface State { owner: Address, validator: Address, balance: bigint, inSet: bigint | null, returnable: bigint | null }
const state = shallowRef<State | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
let runId = 0

async function run() {
  const a = addr.value
  if (!a) return
  const id = ++runId
  const raw = a.toRawString()
  loading.value = true
  error.value = null
  state.value = null
  try {
    const [roles, balance, validators, returned] = await Promise.all([
      runGetMethod(api, raw, 'get_roles').then(parseRoles),
      toncenter.v2<string>('getAddressBalance', { address: raw }).then(BigInt),
      api.get<{ validators: { address: string, stake: number }[] }>('blockchain/validators').then(r => r.validators, () => null),
      // The elector keys stakes by the masterchain account id.
      a.workChain === -1
        ? runGetMethod(api, ELECTOR, 'compute_returned_stake', [`0x${a.hash.toString('hex')}`]).then(r => (r.exit_code === 0 ? stackNum(r.stack[0]) : null), () => null)
        : Promise.resolve(null)
    ])
    if (id !== runId) return
    state.value = { ...roles, balance, inSet: validators ? validatorStake(validators, raw) : null, returnable: returned }
  }
  catch (e) {
    if (id === runId) error.value = e
  }
  finally {
    if (id === runId) loading.value = false
  }
}
onMounted(() => text.value && nextTick(run))
function example() {
  text.value = EXAMPLE
  nextTick(run)
}

const fmt = (a: Address) => a.toString({ bounceable: a.workChain === -1, testOnly: isTestnet.value })
const isOwner = computed(() => !!state.value && !!tc.wallet.value && Address.parse(tc.wallet.value.address).equals(state.value.owner))

// ---------------------------------------------------------------- owner actions
const action = ref<'withdraw' | 'validator'>('withdraw')
const tabs = [{ label: 'Withdraw', value: 'withdraw', icon: 'i-lucide-hand-coins' }, { label: 'Change validator', value: 'validator', icon: 'i-lucide-user-cog' }]
const amountText = ref('')
const amount = ref<bigint | null>(null)
const all = ref(true)
const newValidatorText = ref('')
const newValidator = shallowRef<Address | null>(null)
const available = computed(() => (state.value ? withdrawable(state.value.balance) : 0n))

const problem = computed(() => {
  if (!state.value || !addr.value) return 'Load a pool first.'
  if (action.value === 'withdraw') {
    if (available.value === 0n) return `Nothing to withdraw: the pool holds only ${formatCoin(state.value.balance)} and keeps ${formatCoin(STORAGE_RESERVE)} for storage. Stake at the elector comes back after the round (mytonctrl sends recover_stake).`
    if (!all.value && (amount.value === null || amount.value <= 0n)) return 'Enter an amount or tick "Withdraw everything available".'
    if (!all.value && amount.value! > available.value) return `At most ${formatCoin(available.value)} is withdrawable now.`
    return null
  }
  if (!newValidator.value) return 'Enter the new validator wallet address.'
  if (newValidator.value.equals(state.value.validator)) return 'That is already the validator.'
  return null
})
const messages = computed<TonConnectMessage[]>(() => {
  if (problem.value || !addr.value) return []
  const to = addr.value.toString({ bounceable: true, testOnly: isTestnet.value })
  const payload = action.value === 'withdraw' ? withdrawBody(all.value ? available.value : amount.value!) : changeValidatorBody(newValidator.value!)
  return [{ address: to, amount: ACTION_VALUE, payload }]
})
// The shared TxPreview does not know single-nominator op codes yet, so spell out the body here.
const bodyItems = computed(() => {
  if (!messages.value.length) return []
  return action.value === 'withdraw'
    ? [{ label: 'op', value: '0x1000 (withdraw)', copy: false }, { label: 'query_id', value: '0', copy: false }, { label: 'amount', value: `${formatCoin(all.value ? available.value : amount.value!)} (${(all.value ? available.value : amount.value!).toString()} ${NANO_NAME})`, copy: false }]
    : [{ label: 'op', value: '0x1001 (change_validator)', copy: false }, { label: 'query_id', value: '1', copy: false }, { label: 'new validator', value: newValidator.value!.toRawString() }]
})
const blocked = computed(() => (state.value && tc.wallet.value && !isOwner.value
  ? `The connected wallet is not this pool's owner (${fmt(state.value.owner)}). The pool ignores owner commands from anyone else and would keep the attached ${COIN_SYMBOL}. Connect the owner wallet.`
  : null))
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <AddressInput v-model="text" label="Single nominator pool address" placeholder="Ef… / -1:…" @parsed="addr = $event" />
      <div class="flex flex-wrap items-center gap-2">
        <UButton label="Load pool" icon="i-lucide-search" :disabled="!addr" :loading="loading" data-testid="run" @click="run" />
        <UButton label="Try a live mainnet pool" icon="i-lucide-sparkles" variant="link" size="sm" data-testid="try-example" @click="example" />
      </div>
    </div>

    <LoadingState v-if="loading" label="Reading get_roles, balance and elector state…" />
    <ErrorNotice v-else-if="error" :error="error" title="Could not read this pool" @retry="run" />

    <template v-if="state && addr && !loading">
      <div class="space-y-4 rounded-lg border border-default p-4" data-testid="pool-state">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <p class="text-xs text-muted">
              Owner (cold wallet, controls the funds)
            </p>
            <AddressLink :address="state.owner.toRawString()" :bounceable="false" />
            <UBadge v-if="isOwner" color="success" variant="subtle" size="sm" label="Connected" class="ml-1" />
          </div>
          <div>
            <p class="text-xs text-muted">
              Validator (node wallet, can only stake)
            </p>
            <AddressLink :address="state.validator.toRawString()" />
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt class="text-xs text-muted">Pool balance</dt><dd><TokenAmount :nano="state.balance" :max-decimals="4" /></dd></div>
          <div><dt class="text-xs text-muted">Withdrawable now</dt><dd class="text-success"><TokenAmount :nano="available" :max-decimals="4" /></dd></div>
          <div>
            <dt class="text-xs text-muted">
              Stake in validator set
            </dt>
            <dd>
              <TokenAmount v-if="state.inSet !== null" :nano="state.inSet" :max-decimals="0" /><span v-else class="text-muted">not validating</span>
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Elector can return now
            </dt>
            <dd><TokenAmount v-if="state.returnable !== null" :nano="state.returnable" :max-decimals="4" /><span v-else class="text-muted">—</span></dd>
          </div>
        </dl>
        <UAlert
          v-if="state.inSet"
          color="info"
          variant="subtle"
          icon="i-lucide-lock"
          :description="`${formatCoin(state.inSet, { maxDecimals: 0 })} is locked at the elector for the current validation round and cannot be withdrawn yet. After the round (plus the stake hold period) the validator's mytonctrl recovers it into the pool, and then the owner can withdraw it.`"
        />
        <ExplorerLinks :value="addr.toRawString()" />
      </div>

      <div class="space-y-4">
        <UTabs v-model="action" :items="tabs" :content="false" class="w-full" />
        <template v-if="action === 'withdraw'">
          <UCheckbox v-model="all" :label="`Withdraw everything available (${formatCoin(available, { maxDecimals: 4 })})`" />
          <AmountInput v-if="!all" v-model="amountText" v-model:nano="amount" :label="`Amount (${COIN_SYMBOL})`" />
          <p class="text-sm text-muted">
            Sends op 0x1000 with {{ formatCoin(ACTION_VALUE) }} attached. The pool pays min(amount, balance − {{ formatCoin(STORAGE_RESERVE) }}) to the owner and returns what is left of the attached coins (send mode 64).
          </p>
        </template>
        <template v-else>
          <AddressInput v-model="newValidatorText" label="New validator wallet" placeholder="Ef… / -1:…" @parsed="newValidator = $event" />
          <UAlert v-if="newValidator && newValidator.workChain !== -1" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="Validator wallets live in the masterchain (-1:…). A basechain address cannot send stakes to the elector." />
          <p class="text-sm text-muted">
            Sends op 0x1001. Use it when the validator node is compromised or replaced: from then on only the new wallet can send stakes. To stop validating entirely, set it to the zero address -1:000…000.
          </p>
        </template>
        <UAlert v-if="problem" color="neutral" variant="subtle" icon="i-lucide-info" :description="problem" />
      </div>

      <div v-if="bodyItems.length" class="rounded-lg border border-default px-4 py-2">
        <p class="pt-2 text-xs font-medium text-muted">
          Message body (single-nominator contract)
        </p>
        <KeyValue :items="bodyItems" />
      </div>
      <SendFlow
        :messages="messages"
        purpose="send owner commands"
        :label="action === 'withdraw' ? 'Withdraw to owner' : 'Change validator'"
        :blocked="blocked"
        :confirm="action === 'validator' ? 'I understand the current validator loses access to this pool immediately.' : undefined"
      />
    </template>

    <p class="text-xs text-muted">
      Works with the <a href="https://github.com/ton-blockchain/single-nominator" target="_blank" rel="noopener" class="underline">ton-blockchain/single-nominator</a> contract. Owner and validator come from its get_roles method; elector data from the elector's compute_returned_stake and tonapi's current validator set.
    </p>
  </div>
</template>
