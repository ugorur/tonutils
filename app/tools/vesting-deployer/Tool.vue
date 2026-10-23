<script setup lang="ts">
import { Address } from '@ton/core'
import DeployPanel from '~/lib/deployers/DeployPanel.vue'
import { humanDuration, unlockSchedule } from '~/tools/vesting-viewer/logic'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { DEPLOY_VALUE, normalizePublicKey, planVesting, validateVesting, vestingMessages, type VestingForm } from './logic'

const { isTestnet, network } = useTonNetwork()
const tc = useTonConnect()
const tonapi = useTonapi()

const owner = ref('')
const ownerAddr = shallowRef<Address | null>(null)
const publicKey = ref('')
const start = ref('')
const total = ref('')
const totalNano = ref<bigint | null>(null)
const durationDays = ref('')
const cliffDays = ref('')
const unlockDays = ref('')
const whitelist = ref('')
const masterchain = ref(false)
const fund = ref(true)
const touched = ref(false)

// ---------------------------------------------------------------- owner public key (the vesting wallet is also signable by it)
const keyState = ref<'idle' | 'loading' | 'ok' | 'error'>('idle')
// tonapi answers 400 "unknown wallet version" for undeployed wallets and non-wallet contracts; anything else is a failed request.
const keyError = ref<unknown>(null)
let keyReq = 0
async function fetchKey(a: Address | null) {
  const id = ++keyReq
  if (!a) {
    keyState.value = 'idle'
    return
  }
  keyState.value = 'loading'
  keyError.value = null
  try {
    const k = normalizePublicKey(await tonapi.get<{ public_key?: string }>(`accounts/${a.toRawString()}/publickey`))
    if (id !== keyReq) return
    publicKey.value = k
    keyState.value = 'ok'
  }
  catch (e) {
    if (id !== keyReq) return
    publicKey.value = ''
    keyState.value = 'error'
    keyError.value = e instanceof TonApiError && e.status !== 400 && e.status !== 404 ? e : null
  }
}
watch([ownerAddr, network], ([a]) => fetchKey(a))

const startTime = computed(() => {
  if (!start.value) return null
  const t = new Date(start.value).getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
})

const form = computed<VestingForm>(() => ({
  owner: owner.value,
  publicKey: publicKey.value,
  startTime: startTime.value,
  total: totalNano.value,
  durationDays: durationDays.value,
  cliffDays: cliffDays.value,
  unlockDays: unlockDays.value,
  whitelist: whitelist.value,
  masterchain: masterchain.value
}))

const sender = computed(() => tc.wallet.value?.address)
const checked = computed(() => {
  // Without a wallet the form is still validated; the sender only changes the address.
  const s = sender.value ?? '0:0000000000000000000000000000000000000000000000000000000000000000'
  return validateVesting(form.value, Address.parse(s))
})
// Errors show once the user has started filling in the schedule.
watch([start, total, durationDays, cliffDays, unlockDays], () => {
  touched.value = true
})
const err = (k: keyof typeof checked.value.errors) => (touched.value ? checked.value.errors[k] : undefined)

const plan = computed(() => (sender.value && checked.value.config ? planVesting(checked.value.config) : null))
const friendly = computed(() => plan.value?.address.toString({ bounceable: true, testOnly: isTestnet.value }) ?? '')
const messages = computed<TonConnectMessage[]>(() => (plan.value ? vestingMessages(plan.value, checked.value.whitelist, fund.value ? checked.value.config!.totalAmount : null, isTestnet.value) : []))

const schedule = computed(() => {
  const c = checked.value.config
  if (!c) return null
  const v = { startTime: c.startTime, totalDuration: c.totalDuration, unlockPeriod: c.unlockPeriod, cliffDuration: c.cliffDuration, totalAmount: c.totalAmount }
  const ev = unlockSchedule(v)
  return { ev, periods: c.totalDuration / c.unlockPeriod, c }
})
const inDays = (sec: number) => {
  const d = +(sec / 86400).toFixed(2)
  return `${d} day${d === 1 ? '' : 's'}`
}
const date = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function preset(d: string, cliff: string, unlock: string) {
  durationDays.value = d
  cliffDays.value = cliff
  unlockDays.value = unlock
}

// Real mainnet vesting EQDWiWnU…GNNS: 48 months (1440 days) from 2024-10-18, 360-day cliff, monthly unlocks, owner UQAG3pIv…q7N-.
function tryExample() {
  owner.value = 'UQAG3pIvsXdFJVKVLmf-bh-9zMUcM51RNoysUgCWv8Q3q7N-'
  start.value = toLocalInput(1729242000)
  total.value = '1710938'
  preset('1440', '360', '30')
  whitelist.value = ''
  masterchain.value = false
  touched.value = true
}
function toLocalInput(t: number) {
  const d = new Date(t * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      :title="`Lock ${COIN_SYMBOL} for a team member or investor`"
      :description="`You create a vesting wallet for the recipient: the official vesting contract that vesting.ton.org deploys. The ${COIN_SYMBOL} in it unlocks gradually; the recipient can only send unlocked ${COIN_SYMBOL}, except to you or to whitelisted addresses (e.g. a staking pool). You stay the vesting sender: you can add whitelist addresses later, and the recipient can always send funds back to you.${isTestnet ? '' : ' Tip: try it on testnet first (switch in the header).'}`"
    />

    <div class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Recipient
        </h3>
        <UButton label="Fill an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
      <AddressInput v-model="owner" label="Recipient's wallet address" required @parsed="a => ownerAddr = a" />
      <UFormField
        label="Recipient's public key"
        :error="err('publicKey')"
        :help="keyState === 'loading' ? 'Reading it from the recipient\'s wallet…' : keyState === 'ok' ? 'Read from the recipient\'s wallet. It lets them also sign for the vesting wallet directly.' : 'Filled in automatically from the recipient\'s wallet.'"
      >
        <UInput v-model="publicKey" class="w-full font-mono" placeholder="64 hex characters" :loading="keyState === 'loading'" />
      </UFormField>
      <ErrorNotice v-if="keyState === 'error' && keyError" :error="keyError" title="Could not read the recipient's public key" @retry="fetchKey(ownerAddr)" />
      <UAlert
        v-else-if="keyState === 'error'"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Could not read the recipient's public key"
        description="Their wallet has probably never sent a transaction, so it is not deployed yet (or the address is not a standard wallet). Ask them to send any small transaction first (vesting.ton.org asks for the same), or paste their public key above."
      />
    </div>

    <div class="space-y-4">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Schedule
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Vesting start" :error="err('startTime')" help="Your local time. Nothing unlocks before this.">
          <UInput v-model="start" type="datetime-local" class="w-full" />
        </UFormField>
        <div>
          <AmountInput v-model="total" v-model:nano="totalNano" label="Total amount to vest" placeholder="1000" />
          <p v-if="err('total')" class="mt-1 text-xs text-error">
            {{ err('total') }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton label="48 months, 12-month cliff, monthly" size="xs" variant="outline" color="neutral" @click="preset('1440', '360', '30')" />
        <UButton label="12 months, monthly, no cliff" size="xs" variant="outline" color="neutral" @click="preset('360', '0', '30')" />
        <UButton label="Full unlock after 1 year" size="xs" variant="outline" color="neutral" @click="preset('365', '0', '365')" />
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField label="Total duration (days)" :error="err('durationDays')" help="Including the cliff.">
          <UInput v-model="durationDays" inputmode="decimal" placeholder="1440" class="w-full" @blur="touched = true" />
        </UFormField>
        <UFormField label="Cliff (days)" :error="err('cliffDays')" help="Nothing can be withdrawn before it ends. 0 for none.">
          <UInput v-model="cliffDays" inputmode="decimal" placeholder="360" class="w-full" @blur="touched = true" />
        </UFormField>
        <UFormField label="Unlock every (days)" :error="err('unlockDays')" help="30 = monthly (months count as 30 days). Must divide the duration and the cliff.">
          <UInput v-model="unlockDays" inputmode="decimal" placeholder="30" class="w-full" @blur="touched = true" />
        </UFormField>
      </div>

      <div v-if="schedule" class="rounded-lg border border-default p-4 text-sm" data-testid="schedule">
        <p class="text-highlighted">
          {{ schedule.periods }} unlock{{ schedule.periods === 1 ? '' : 's' }} of
          <TokenAmount :nano="schedule.c.totalAmount / BigInt(schedule.periods)" /> every {{ inDays(schedule.c.unlockPeriod) }}
          over {{ inDays(schedule.c.totalDuration) }} ({{ humanDuration(schedule.c.totalDuration) }}){{ schedule.c.cliffDuration ? `, after a cliff of ${inDays(schedule.c.cliffDuration)}` : '' }}.
        </p>
        <ul v-if="schedule.ev" class="mt-2 space-y-1 text-muted">
          <li>First unlock: {{ date(schedule.ev[0]!.time) }}, <TokenAmount :nano="schedule.ev[0]!.amount" /></li>
          <li>Fully unlocked: {{ date(schedule.ev.at(-1)!.time) }}</li>
        </ul>
      </div>
    </div>

    <div class="space-y-4">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Options
      </h3>
      <UFormField label="Whitelist (optional)" :error="err('whitelist')" :help="`Addresses the recipient may send locked ${COIN_SYMBOL} to, one per line: e.g. a single-nominator or Tonstakers pool. You can add more later; nobody can remove them.`">
        <UTextarea v-model="whitelist" class="w-full font-mono" :rows="2" autoresize placeholder="Leave empty if not needed" />
      </UFormField>
      <UCheckbox v-model="masterchain" label="Deploy in the masterchain" description="Only needed if the recipient will validate directly from the vesting wallet (elector in the whitelist). Masterchain fees are higher." />
      <UCheckbox v-model="fund" label="Fund it now with the total amount" :description="`Adds a second message with the vested ${COIN_SYMBOL}. Turn off to top it up later from any wallet. Deploying costs ${formatCoin(DEPLOY_VALUE)}${checked.whitelist.length ? ', mostly returned to you after the whitelist is set' : ', which stays on the vesting wallet (the recipient can use it right away)'}.`" />
    </div>

    <WalletGate purpose="create the vesting wallet">
      <template #default>
        <div v-if="plan && messages.length" class="space-y-4">
          <ResultField label="Vesting wallet address" :value="friendly" hint="Computed from the recipient, the schedule and your wallet (the vesting sender)." />
          <DeployPanel
            :messages="messages"
            :target="plan.address.toRawString()"
            label="Create vesting wallet"
            existing-text="You already created a vesting wallet with exactly these settings. Change the start time or amount to create another one, or top the existing one up with a normal transfer."
            :confirm="`I checked the recipient, the amount and the schedule. They can never be changed after deploy, and locked ${COIN_SYMBOL} cannot be taken back (except by the recipient sending it to me).`"
          >
            <template #done>
              <ResultField label="Vesting wallet" :value="friendly">
                <AddressLink :address="friendly" full />
              </ResultField>
              <p class="text-sm text-muted">
                Share this address with the recipient. They can view and use it on vesting.ton.org; you can check the schedule in the vesting viewer.
              </p>
              <UButton label="Open vesting viewer" icon="i-lucide-hourglass" to="/tools/vesting-viewer" />
            </template>
          </DeployPanel>
        </div>
        <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-pencil" title="Fill in the recipient and schedule above" description="The vesting wallet address and the exact transaction appear here once the form is valid." />
      </template>
    </WalletGate>
  </div>
</template>
