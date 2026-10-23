<script setup lang="ts">
import type { Address } from '@ton/core'
import { Address as Addr } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import BodyOutput from '~/lib/payload-builders/BodyOutput.vue'
import type { PayloadKind } from '~/lib/payload-builders/common'
import { buildPayload, optionalBoc, parseQueryId, transferLink } from '~/lib/payload-builders/common'
import PayloadField from '~/lib/payload-builders/PayloadField.vue'
import SendPanel from '~/lib/payload-builders/SendPanel.vue'
import { formatJettonAmount, jettonDecimals, KNOWN_JETTONS, USDT_MASTER } from '~/utils/ton/jetton'
import type { JettonAction, JettonParams } from './logic'
import { attachProblem, buildJettonBody, checkJettonAmount, messageTarget, recommendedAttach } from './logic'

const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const toncenter = useToncenter()
const tc = useTonConnect()

const action = ref<JettonAction>('transfer')
const actions = [
  { label: 'Transfer', value: 'transfer', icon: 'i-lucide-send' },
  { label: 'Burn', value: 'burn', icon: 'i-lucide-flame' },
  { label: 'Find wallet', value: 'provide', icon: 'i-lucide-search' }
]

// ---------------------------------------------------------------- jetton + owner
const CUSTOM = '__custom'
const pick = ref(isTestnet.value ? CUSTOM : USDT_MASTER)
const customMaster = ref('')
const jettonItems = computed(() => [
  ...(isTestnet.value ? [] : KNOWN_JETTONS.map(j => ({ label: `${j.symbol} · ${j.name}`, value: j.master }))),
  { label: 'Other jetton (paste master address)', value: CUSTOM }
])
const masterText = computed(() => (pick.value === CUSTOM ? customMaster.value : pick.value))
const master = computed<Address | null>(() => {
  try {
    return masterText.value.trim() ? Addr.parse(masterText.value.trim()) : null
  }
  catch {
    return null
  }
})

const ownerText = ref('')
const owner = shallowRef<Address | null>(null)
watch(() => tc.wallet.value?.friendly, (w) => {
  if (w) ownerText.value = w
}, { immediate: true })

interface Holding { wallet: Address, balance: bigint, decimals: number, symbol: string, name: string }
const holding = shallowRef<Holding | null>(null)
const lookupError = ref<unknown>(null)
const looking = ref(false)
const decimalsText = ref('9')
const symbol = ref('')
const walletOverride = ref('')

/** tonapi first (balance + metadata in one call), toncenter v3 as fallback when tonapi is busy. */
async function fetchHolding(o: string, m: string): Promise<Holding> {
  try {
    const r = await tonapi.get<{ balance: string, wallet_address: { address: string }, jetton: { decimals: number, symbol: string, name: string } }>(`accounts/${o}/jettons/${m}`)
    return { wallet: Addr.parse(r.wallet_address.address), balance: BigInt(r.balance), decimals: r.jetton.decimals, symbol: r.jetton.symbol, name: r.jetton.name }
  }
  catch (e) {
    const r = await toncenter.v3<{ jetton_wallets: { address: string, balance: string }[], metadata?: Record<string, { token_info?: { name?: string, symbol?: string, extra?: { decimals?: string } }[] }> }>('jetton/wallets', { owner_address: o, jetton_address: m, limit: 1 }).catch(() => {
      throw e
    })
    const w = r.jetton_wallets[0]
    if (!w) throw new Error('This owner has no wallet for this jetton yet (it never received any). Check the owner and jetton.')
    const info = Object.entries(r.metadata ?? {}).find(([k]) => k.toLowerCase() === m.toLowerCase())?.[1].token_info?.[0]
    const known = KNOWN_JETTONS.find(j => Addr.parse(j.master).toRawString() === m)
    return { wallet: Addr.parse(w.address), balance: BigInt(w.balance), decimals: jettonDecimals(info?.extra ?? (known ? { decimals: known.decimals } : null)), symbol: info?.symbol ?? known?.symbol ?? '', name: info?.name ?? known?.name ?? 'Jetton' }
  }
}

async function lookup() {
  holding.value = null
  lookupError.value = null
  if (!owner.value || !master.value || action.value === 'provide') return
  looking.value = true
  const o = owner.value.toRawString()
  const m = master.value.toRawString()
  try {
    const h = await fetchHolding(o, m)
    if (owner.value?.toRawString() !== o || master.value?.toRawString() !== m) return
    holding.value = h
    decimalsText.value = String(h.decimals)
    symbol.value = h.symbol
  }
  catch (e) {
    lookupError.value = e
    const known = KNOWN_JETTONS.find(j => master.value && Addr.parse(j.master).equals(master.value))
    if (known) {
      decimalsText.value = String(known.decimals)
      symbol.value = known.symbol
    }
  }
  finally {
    looking.value = false
  }
}
watch([() => owner.value?.toRawString(), () => master.value?.toRawString(), network, action], () => lookup())

const decimals = computed(() => {
  const n = Number(decimalsText.value)
  return Number.isInteger(n) && n >= 0 && n <= 255 ? n : 9
})
const jettonWallet = computed<Address | null>(() => {
  if (walletOverride.value.trim()) {
    try {
      return Addr.parse(walletOverride.value.trim())
    }
    catch {
      return null
    }
  }
  return holding.value?.wallet ?? null
})

// ---------------------------------------------------------------- form
const recipientText = ref('')
const recipient = shallowRef<Address | null>(null)
const amountText = ref('')
const amount = ref<bigint | null>(null)
const responseText = ref('')
const response = shallowRef<Address | null>(null)
const fwdText = ref('0.000000001')
const fwd = computed(() => nanoOf(fwdText.value))
const fwdKind = ref<PayloadKind>('comment')
const fwdValue = ref('')
const customText = ref('')
const queryText = ref('0')
const includeAddress = ref(true)
const attachText = ref('')
const attach = computed(() => nanoOf(attachText.value))
const attachTouched = ref(false)

/** Fields inside the collapsed Advanced panel are not mounted, so parse them here rather than via v-model:nano. */
function nanoOf(text: string): bigint | null {
  try {
    return text.trim() ? parseUnits(text) : null
  }
  catch {
    return null
  }
}

const recommended = computed(() => recommendedAttach(action.value, action.value === 'transfer' ? (fwd.value ?? 0n) : 0n))
watch(recommended, (r) => {
  if (!attachTouched.value) attachText.value = formatUnits(r)
}, { immediate: true })

function setMax() {
  if (holding.value) amountText.value = formatUnits(holding.value.balance, decimals.value)
}

function example() {
  if (isTestnet.value) useTonNetwork().toggle()
  action.value = 'transfer'
  pick.value = USDT_MASTER
  // A real USD₮ holder and a real recipient from mainnet transfer q+l5N17S… (toncenter).
  ownerText.value = tc.wallet.value?.friendly ?? 'UQDXNRjipyg5fusU70d5EmqIx_5u1eGe1Rs0PLF3-OHOvFpO'
  recipientText.value = 'UQCFJEP4WZ_mpdo0_kMEmsTgvrMHG7K_tWY16pQhKHwoOtFz'
  amountText.value = '1.5'
  fwdKind.value = 'comment'
  fwdValue.value = 'Thanks!'
  responseText.value = ''
}

// ---------------------------------------------------------------- build
const built = computed(() => {
  try {
    const queryId = parseQueryId(queryText.value)
    if (responseText.value.trim() && !response.value) return { error: 'The response destination is not a valid address.' }
    const resp = responseText.value.trim() ? response.value : owner.value
    let params: JettonParams
    if (action.value === 'provide') {
      if (!owner.value) return { error: 'Enter the owner whose jetton wallet you want to find.' }
      params = { action: 'provide', p: { queryId, owner: owner.value, includeAddress: includeAddress.value } }
    }
    else {
      const amountError = checkJettonAmount(amount.value, holding.value?.balance)
      if (amountError && amount.value === null) return { error: amountError }
      if (action.value === 'transfer') {
        if (!recipient.value) return { error: 'Enter the recipient address.' }
        if (fwd.value === null) return { error: 'Enter a forward amount (0 to skip the notification).' }
        params = {
          action: 'transfer',
          p: { queryId, amount: amount.value!, destination: recipient.value, responseDestination: resp, forwardTonAmount: fwd.value, forwardPayload: buildPayload(fwdKind.value, fwdValue.value), customPayload: optionalBoc(customText.value) }
        }
      }
      else {
        params = { action: 'burn', p: { queryId, amount: amount.value!, responseDestination: resp, customPayload: optionalBoc(customText.value) } }
      }
      if (amountError) return { body: buildJettonBody(params), amountError }
    }
    return { body: buildJettonBody(params) }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})

const target = computed(() => messageTarget(action.value, jettonWallet.value, master.value))
const problem = computed(() => (attach.value === null ? null : attachProblem(action.value, attach.value, action.value === 'transfer' ? (fwd.value ?? 0n) : 0n)))

const messages = computed<TonConnectMessage[] | null>(() => {
  const b = built.value
  if (!('body' in b) || !b.body || !target.value || attach.value === null || problem.value?.severity === 'error') return null
  return [{ address: target.value.toString({ bounceable: true, testOnly: isTestnet.value }), amount: attach.value, payload: b.body }]
})
const link = computed(() => (messages.value && target.value ? transferLink(target.value, attach.value!, built.value.body, null, isTestnet.value) : null))

const blocked = computed(() => {
  const w = tc.wallet.value
  if (!w) return null
  if (action.value !== 'provide' && owner.value && !owner.value.equals(Addr.parse(w.address))) {
    return 'Only the owner can move or burn these jettons. Set the owner to your connected wallet, or connect the owner\'s wallet.'
  }
  if (built.value && 'amountError' in built.value && built.value.amountError) return built.value.amountError
  return null
})
const sym = computed(() => symbol.value || 'tokens')
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="action" :items="actions" :content="false" class="w-full" />
    <p class="text-sm text-muted">
      <template v-if="action === 'transfer'">
        Builds a TEP-74 <code class="font-mono">transfer#0f8a7ea5</code>. It goes to <strong>your own jetton wallet</strong>, which moves the tokens to the recipient's jetton wallet and pings the recipient.
      </template>
      <template v-else-if="action === 'burn'">
        Builds a TEP-74 <code class="font-mono">burn#595f07bc</code>. Burned tokens are destroyed for good and the total supply shrinks.
      </template>
      <template v-else>
        Builds a TEP-89 <code class="font-mono">provide_wallet_address#2c76b973</code>. Sent to the jetton master, which answers with <code class="font-mono">take_wallet_address</code> carrying the owner's jetton wallet address.
      </template>
    </p>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Jetton">
        <USelect v-model="pick" :items="jettonItems" class="w-full" size="lg" />
      </UFormField>
      <AddressInput v-if="pick === CUSTOM" v-model="customMaster" label="Jetton master address" />
      <AddressInput v-model="ownerText" :label="action === 'provide' ? 'Owner to look up' : 'Owner (sender) wallet'" :placeholder="tc.wallet.value ? '' : 'Connect a wallet or paste the owner address'" required @parsed="owner = $event" />
    </div>

    <UButton v-if="!recipientText && action === 'transfer'" label="Try a real mainnet USD₮ transfer" icon="i-lucide-sparkles" variant="link" size="sm" class="-mt-3 px-0" @click="example" />

    <LoadingState v-if="looking" label="Finding the owner's jetton wallet…" />
    <div v-else-if="holding" class="rounded-lg border border-default px-4 py-1" data-testid="holding">
      <ResultField label="Owner's jetton wallet (the message goes here)" :value="holding.wallet.toString({ testOnly: isTestnet })">
        <AddressLink :address="holding.wallet.toString({ testOnly: isTestnet })" full />
      </ResultField>
      <ResultField label="Balance" :value="formatJettonAmount(holding.balance, holding.decimals, { symbol: holding.symbol })" :copy="false" :hint="`${holding.name}, ${holding.decimals} decimals`" />
    </div>
    <ErrorNotice v-else-if="lookupError" :error="lookupError" title="Could not find this owner's jetton wallet" @retry="lookup" />

    <template v-if="action !== 'provide'">
      <div class="grid gap-4 sm:grid-cols-2">
        <AddressInput v-if="action === 'transfer'" v-model="recipientText" label="Recipient (their main wallet, not a jetton wallet)" required @parsed="recipient = $event" />
        <div>
          <AmountInput v-model="amountText" v-model:nano="amount" :label="`Amount to ${action === 'burn' ? 'burn' : 'send'}`" :unit="sym" :decimals="decimals" />
          <UButton v-if="holding" label="Max" size="xs" variant="link" class="px-0" @click="setMax" />
        </div>
      </div>
      <PayloadField v-if="action === 'transfer'" v-model:kind="fwdKind" v-model:text="fwdValue" label="Forward payload" hint="Delivered to the recipient with the transfer notification" />
    </template>
    <USwitch v-else v-model="includeAddress" label="include_address: also return the owner address in the reply" />

    <UCollapsible class="rounded-lg border border-default">
      <UButton label="Advanced: amounts, response address, custom payload, query id" color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down" block class="justify-between" />
      <template #content>
        <div class="grid gap-4 p-4 sm:grid-cols-2">
          <AmountInput v-if="action === 'transfer'" v-model="fwdText" label="Forward amount (forward_ton_amount)" />
          <AmountInput v-model="attachText" :label="`${COIN_SYMBOL} attached to the message`" @update:model-value="attachTouched = true" />
          <AddressInput v-if="action !== 'provide'" v-model="responseText" label="Response destination (gets the excess)" placeholder="Default: the owner" @parsed="response = $event" />
          <UFormField label="Query id" hint="uint64, echoed in replies">
            <UInput v-model="queryText" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
          </UFormField>
          <UFormField v-if="action !== 'provide'" label="Decimals" hint="Filled from the jetton metadata">
            <UInput v-model="decimalsText" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
          </UFormField>
          <AddressInput v-if="action !== 'provide'" v-model="walletOverride" label="Jetton wallet override" placeholder="Only if the lookup fails" />
          <UFormField v-if="action !== 'provide'" label="Custom payload (BOC, optional)" hint="Only some jettons use it (e.g. mintless claims)" class="sm:col-span-2">
            <UTextarea v-model="customText" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="te6cc…" />
          </UFormField>
        </div>
      </template>
    </UCollapsible>
    <p class="-mt-3 text-xs text-muted">
      Attached {{ COIN_SYMBOL }} pays gas; whatever is not used comes back to the response address. Recommended: {{ formatCoin(recommended) }}.
    </p>

    <UAlert v-if="'error' in built" color="neutral" variant="subtle" icon="i-lucide-info" :description="built.error" />
    <UAlert v-if="problem" :color="problem.severity === 'error' ? 'error' : 'warning'" variant="subtle" icon="i-lucide-triangle-alert" :description="problem.text" />

    <template v-if="built.body">
      <BodyOutput :body="built.body" :link="link" />
      <UAlert v-if="!target" color="neutral" variant="subtle" icon="i-lucide-info" description="The body is ready. To preview and send the full message, the owner's jetton wallet must be known (enter a valid owner and jetton)." />
      <SendPanel
        v-if="messages"
        :messages="messages"
        :purpose="action === 'burn' ? 'burn jettons' : action === 'provide' ? 'query the jetton master' : 'send jettons'"
        :confirm="action === 'burn' ? `I understand burned ${sym} are destroyed forever` : undefined"
        :blocked="blocked"
        :label="action === 'burn' ? 'Burn with wallet' : 'Send with wallet'"
      />
    </template>
  </div>
</template>
