<script setup lang="ts">
import { Address } from '@ton/core'
import MetadataFields from '~/lib/token-launch/MetadataFields.vue'
import { validateMetadata, type MetadataForm } from '~/lib/token-launch/jetton-minter'
import { USDT_MASTER } from '~/utils/ton/jetton'
import {
  ACTIONS, actionMessage, availableActions, detect, parseMaster, parseNextAdmin,
  type ActionId, type ActionInput, type Detected, type MasterState, type TonapiMethodResult, type ToncenterJettonMaster
} from './logic'

const route = useRoute()
const router = useRouter()
const { isTestnet, network } = useTonNetwork()
const toncenter = useToncenter()
const tonapi = useTonapi()
const tc = useTonConnect()

const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = shallowRef<Address | null>(null)

interface Loaded {
  state: MasterState
  detected: Detected | null
  nextAdmin: string | null
  name: string
  symbol: string
  image?: string
}
const loading = ref(false)
const error = ref<unknown>(null)
const info = ref<Loaded | null>(null)
const imageBroken = ref(false)
watch(() => info.value?.image, () => (imageBroken.value = false))

const friendly = (raw: string, bounceable = true) => Address.parse(raw).toString({ bounceable, testOnly: isTestnet.value })

async function load() {
  const a = parsed.value
  if (!a) return
  loading.value = true
  error.value = null
  info.value = null
  router.replace({ query: { ...route.query, q: input.value.trim() } })
  try {
    const raw = a.toRawString()
    const r = await toncenter.v3<{ jetton_masters: ToncenterJettonMaster[], metadata?: Record<string, { token_info?: { name?: string, symbol?: string, image?: string, extra?: Record<string, unknown> }[] }> }>('jetton/masters', { address: raw })
    const m = r.jetton_masters[0]
    if (!m) throw new Error(`No jetton minter at this address on ${network.value}. Paste the jetton master address (the token's contract), not a wallet or a jetton wallet.`)
    const tokenInfo = Object.values(r.metadata ?? {})[0]?.token_info?.[0]
    const extraDecimals = tokenInfo?.extra?.decimals
    const state = parseMaster(m, typeof extraDecimals === 'string' || typeof extraDecimals === 'number' ? String(extraDecimals) : undefined)
    const method = await tonapi.get<TonapiMethodResult>(`blockchain/accounts/${raw}/methods/get_next_admin_address`).catch(() => null)
    const next = method ? parseNextAdmin(method) : null
    info.value = {
      state,
      detected: detect(state.codeHash, next?.family ?? null),
      nextAdmin: next?.nextAdmin ?? null,
      name: tokenInfo?.name || state.content.name || 'Unnamed token',
      symbol: tokenInfo?.symbol || state.content.symbol || '?',
      image: tokenInfo?.image || state.content.image
    }
    resetForms()
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function tryExample() {
  input.value = USDT_MASTER
  nextTick(load)
}

// ---------------------------------------------------------------- actions
const actions = computed<ActionId[]>(() => {
  const i = info.value
  const w = tc.wallet.value
  if (!i?.detected || !w) return []
  return availableActions(i.state, i.detected, w.address, i.nextAdmin)
})
const tabItems = computed(() => actions.value.map(id => ({ label: ACTIONS[id].label, value: id, icon: ACTIONS[id].icon })))
const action = ref<ActionId>('mint')
watch(actions, a => (action.value = a.includes(action.value) ? action.value : a[0] ?? 'mint'))

const mintTo = ref('')
const mintToParsed = shallowRef<Address | null>(null)
const mintText = ref('')
const mintAmount = ref<bigint | null>(null)
const newAdmin = ref('')
const newAdminParsed = shallowRef<Address | null>(null)
const meta = ref<MetadataForm>({ name: '', symbol: '', decimals: '9', description: '', image: '', mode: 'onchain', uri: '' })
const confirmed = ref(false)
const sending = ref<'' | 'signing' | 'waiting'>('')
const sendError = ref<unknown>(null)
const done = ref<{ label: string, hash: string } | null>(null)
watch(action, () => {
  confirmed.value = false
  sendError.value = null
  done.value = null
})

function resetForms() {
  const c = info.value?.state.content ?? {}
  mintTo.value = tc.wallet.value?.friendly ?? ''
  mintText.value = ''
  newAdmin.value = ''
  confirmed.value = false
  meta.value = {
    name: c.name ?? '', symbol: c.symbol ?? '', description: c.description ?? '', image: c.image ?? '',
    decimals: String(info.value?.state.decimals ?? 9),
    // toncenter merges fields fetched from the JSON into jetton_content, so a `uri` means off-chain metadata.
    mode: c.uri ? 'offchain' : 'onchain', uri: c.uri ?? ''
  }
}
watch(() => tc.wallet.value?.friendly, f => (mintTo.value ||= f ?? ''))

const metaCheck = computed(() => {
  const uriOnly = info.value?.detected?.metadata === 'uri'
  return validateMetadata(uriOnly ? { ...meta.value, mode: 'offchain' } : meta.value)
})
const decimalsChanged = computed(() => !!info.value && meta.value.mode === 'onchain' && info.value.detected?.metadata === 'content' && !metaCheck.value.errors.decimals && metaCheck.value.decimals !== info.value.state.decimals)

/** Needs an explicit tick box before the send button unlocks. */
const needsConfirm = computed(() => action.value === 'drop-admin' || (action.value === 'change-admin' && info.value?.detected?.family === 'legacy') || (action.value === 'metadata' && decimalsChanged.value))

const actionInput = computed<ActionInput | null>(() => {
  const w = tc.wallet.value
  if (!w) return null
  switch (action.value) {
    case 'mint':
      return mintToParsed.value && mintAmount.value && mintAmount.value > 0n ? { id: 'mint', to: mintToParsed.value, amount: mintAmount.value, response: Address.parse(w.address) } : null
    case 'change-admin':
      return newAdminParsed.value && newAdminParsed.value.toRawString() !== info.value?.state.admin ? { id: 'change-admin', newAdmin: newAdminParsed.value } : null
    case 'claim-admin':
    case 'drop-admin':
      return { id: action.value }
    case 'metadata': {
      const c = metaCheck.value
      if (!c.content) return null
      return { id: 'metadata', content: info.value?.detected?.metadata === 'uri' ? meta.value.uri.trim() : c.content }
    }
  }
  return null
})

const messages = computed(() => {
  const i = info.value
  if (!i?.detected || !actionInput.value) return []
  try {
    return [actionMessage(i.state.raw, i.detected, actionInput.value, isTestnet.value)]
  }
  catch {
    return []
  }
})


async function send() {
  if (!messages.value.length || (needsConfirm.value && !confirmed.value)) return
  sendError.value = null
  done.value = null
  try {
    sending.value = 'signing'
    const r = await tc.sendTransaction({ messages: messages.value })
    sending.value = 'waiting'
    const trace = await tc.waitForTransaction(r.hash)
    done.value = { label: ACTIONS[action.value].label, hash: trace.external_hash }
    await load()
  }
  catch (e) {
    sendError.value = e
  }
  finally {
    sending.value = ''
  }
}

const kindLabel = computed(() => {
  const d = info.value?.detected
  if (!d) return 'Unknown contract'
  if (d.flavor) return d.flavor.label
  return d.family === 'v2' ? 'Jetton 2.x-style minter (unverified code)' : 'Classic-style minter (unverified code)'
})

watch(network, () => {
  info.value = null
  error.value = null
})
onMounted(() => {
  if (input.value) nextTick(load)
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-3">
      <AddressInput v-model="input" label="Jetton master address" placeholder="EQ… (the token's contract address)" @parsed="parsed = $event" @keydown.enter="load" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton label="Load token" icon="i-lucide-search" :loading="loading" :disabled="!parsed" @click="load" />
        <UButton v-if="!isTestnet" label="Try an example (USD₮)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>
    </div>

    <LoadingState v-if="loading" label="Reading the token contract…" />
    <ErrorNotice :error="error" title="Could not load this token" @retry="load" />

    <template v-if="info">
      <div class="rounded-lg border border-default p-4">
        <div class="flex items-start gap-3">
          <img v-if="info.image && !imageBroken" :src="info.image" alt="" class="size-12 shrink-0 rounded-full border border-default object-cover" referrerpolicy="no-referrer" @error="imageBroken = true">
          <div v-else class="grid size-12 shrink-0 place-items-center rounded-full bg-elevated text-muted">
            <UIcon name="i-lucide-coins" class="size-5" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-display font-semibold text-highlighted">
              {{ info.name }} <span class="text-sm font-normal text-muted">{{ info.symbol }}</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-2">
              <UBadge :color="info.detected?.flavor ? 'primary' : 'warning'" variant="subtle" size="sm" :label="kindLabel" />
              <UBadge v-if="!info.state.admin" color="success" variant="subtle" size="sm" icon="i-lucide-lock" label="Admin renounced: supply fixed" />
            </div>
          </div>
        </div>
        <dl class="mt-4 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-xs text-muted">
              Total supply
            </dt>
            <dd class="text-highlighted">
              <TokenAmount :nano="info.state.totalSupply" :decimals="info.state.decimals" :symbol="info.symbol" :max-decimals="4" />
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Decimals
            </dt>
            <dd class="text-highlighted">
              {{ info.state.decimals }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">
              Admin
            </dt>
            <dd>
              <AddressLink v-if="info.state.admin" :address="friendly(info.state.admin, false)" />
              <span v-else class="text-muted">None</span>
            </dd>
          </div>
          <div v-if="info.nextAdmin" class="min-w-0">
            <dt class="text-xs text-muted">
              Pending admin (must claim)
            </dt>
            <dd>
              <AddressLink :address="friendly(info.nextAdmin, false)" />
            </dd>
          </div>
          <div class="min-w-0 sm:col-span-2">
            <dt class="text-xs text-muted">
              Metadata
            </dt>
            <dd class="font-mono text-xs break-all text-default">
              {{ info.state.content.uri ? info.state.content.uri : 'Stored on-chain' }}
            </dd>
          </div>
        </dl>
        <div class="mt-3">
          <ExplorerLinks kind="jetton" :value="friendly(info.state.raw)" />
        </div>
      </div>

      <UAlert
        v-if="!info.detected"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="Not a minter type this panel can manage"
        description="This contract does not answer like a Jetton 2.x or a classic minter, so we will not build admin messages for it. Memepad and bonding-curve tokens are managed by their launchpad."
      />
      <UAlert
        v-else-if="!info.detected.flavor"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Unverified minter code"
        :description="`We recognise the ${info.detected.family === 'v2' ? 'Jetton 2.x' : 'classic'} admin interface but not this exact code. Messages use the standard format for that family; if the contract differs, it rejects them and the attached GRAM bounces back minus fees.${info.detected.metadata ? '' : ' Metadata changes are disabled because the format cannot be confirmed.'}`"
      />

      <WalletGate v-if="info.detected" purpose="manage this token">
        <template #default="{ wallet }">
          <UAlert
            v-if="!actions.length"
            color="neutral"
            variant="subtle"
            icon="i-lucide-user-x"
            title="This wallet is not the admin"
            :description="info.state.admin ? `Only the admin wallet can manage this token. You are connected as ${wallet.friendly}.` : 'The admin was renounced, so nobody can mint more or change this token.'"
          />
          <div v-else class="space-y-5">
            <UTabs v-model="action" :content="false" :items="tabItems" class="w-full overflow-x-auto" />

            <div v-if="action === 'mint'" class="space-y-4">
              <p class="text-sm text-muted">
                Create new tokens and send them to any wallet. Total supply grows by the same amount.
              </p>
              <AddressInput v-model="mintTo" label="Recipient wallet" required @parsed="mintToParsed = $event" />
              <AmountInput v-model="mintText" v-model:nano="mintAmount" label="Amount to mint" :unit="info.symbol" :decimals="info.state.decimals" />
            </div>

            <div v-else-if="action === 'change-admin'" class="space-y-4">
              <p v-if="info.detected.family === 'v2'" class="text-sm text-muted">
                Step 1 of 2: nominate a new admin. Nothing changes until that wallet opens this panel and presses <strong>Claim admin</strong>, so a typo cannot lock you out.
              </p>
              <UAlert v-else color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Takes effect immediately" description="The classic minter has no claim step: the new address becomes admin at once. A wrong address means you lose control of the token for good." />
              <AddressInput v-model="newAdmin" label="New admin address" required @parsed="newAdminParsed = $event" />
              <p v-if="newAdminParsed && newAdminParsed.toRawString() === info.state.admin" class="text-xs text-warning">
                That is already the admin.
              </p>
            </div>

            <div v-else-if="action === 'claim-admin'" class="text-sm text-muted">
              The current admin nominated your wallet. Claim to become the admin of {{ info.symbol }}.
            </div>

            <div v-else-if="action === 'drop-admin'">
              <UAlert color="error" variant="subtle" icon="i-lucide-lock" title="Renouncing is permanent" :description="`After this, nobody can mint more ${info.symbol}, change the admin or edit the metadata. Total supply stays at its current value forever.`" />
              <p class="mt-2 text-xs text-muted">
                The message is {{ info.detected.family === 'v2' ? 'drop_admin (op 0x7431f221)' : 'change_admin (op 3) to the zero address, the classic minter\'s way to renounce' }}.
              </p>
            </div>

            <div v-else-if="action === 'metadata'" class="space-y-3">
              <p class="text-sm text-muted">
                {{ info.detected.metadata === 'uri' ? 'This minter stores only a link to a metadata JSON file. Point it to a new file:' : 'Replace the token\'s name, symbol, logo and description (or switch to a hosted JSON file). Wallets refresh within minutes to hours.' }}
              </p>
              <MetadataFields v-model="meta" :errors="metaCheck.errors" :uri-only="info.detected.metadata === 'uri'" />
              <UAlert v-if="decimalsChanged" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="You are changing the decimals" :description="`Every balance will display differently: 1 base unit is 10^-${metaCheck.decimals} ${info.symbol} instead of 10^-${info.state.decimals}. Only do this to fix a mistake.`" />
            </div>

            <template v-if="messages.length">
              <TxPreview :messages="messages" />
              <UCheckbox v-if="needsConfirm" v-model="confirmed" :label="action === 'drop-admin' ? `I understand ${info.symbol} can never be minted or edited again.` : action === 'metadata' ? 'I want to change the decimals.' : 'I double-checked the new admin address.'" />
            </template>
            <p v-else class="text-xs text-muted">
              Fill in the fields above to see the exact transaction.
            </p>

            <ErrorNotice :error="sendError" title="Not sent" />
            <UAlert v-if="done" color="success" variant="subtle" icon="i-lucide-circle-check" :title="`${done.label}: confirmed`">
              <template #description>
                The token details above are refreshed. <ExplorerLinks kind="tx" :value="done.hash" />
              </template>
            </UAlert>

            <UButton
              :label="sending === 'signing' ? 'Confirm in your wallet…' : sending === 'waiting' ? 'Waiting for the network…' : messages[0] ? `${ACTIONS[action].label} (${formatCoin(messages[0].amount)})` : ACTIONS[action].label"
              :icon="ACTIONS[action].icon"
              :color="action === 'drop-admin' ? 'error' : 'primary'"
              :loading="!!sending"
              :disabled="!messages.length || (needsConfirm && !confirmed)"
              @click="send"
            />
          </div>
        </template>
      </WalletGate>
    </template>
  </div>
</template>
