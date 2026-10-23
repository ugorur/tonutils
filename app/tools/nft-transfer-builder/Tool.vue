<script setup lang="ts">
import type { Address } from '@ton/core'
import { Address as Addr } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import BodyOutput from '~/lib/payload-builders/BodyOutput.vue'
import type { PayloadKind } from '~/lib/payload-builders/common'
import { buildPayload, optionalBoc, parseQueryId, transferLink } from '~/lib/payload-builders/common'
import PayloadField from '~/lib/payload-builders/PayloadField.vue'
import SendPanel from '~/lib/payload-builders/SendPanel.vue'
import type { NftAction, NftParams } from './logic'
import { buildNftBody, NFT_ACTIONS, recommendedAttach, senderProblem } from './logic'

const { network, isTestnet } = useTonNetwork()
const tonapi = useTonapi()
const tc = useTonConnect()

const action = ref<NftAction>('transfer')
const info = computed(() => NFT_ACTIONS.find(a => a.value === action.value)!)
const actionItems = NFT_ACTIONS.map(a => ({ label: a.label, value: a.value }))

// ---------------------------------------------------------------- item
const itemText = ref('')
const item = shallowRef<Address | null>(null)
interface ItemInfo { owner: Address | null, onSale: boolean, name: string, collection: string | null, verified: boolean, image: string | null }
const itemInfo = shallowRef<ItemInfo | null>(null)
const itemError = ref<unknown>(null)
const loading = ref(false)

async function lookup() {
  itemInfo.value = null
  itemError.value = null
  const a = item.value
  if (!a) return
  loading.value = true
  try {
    const r = await tonapi.get<{ owner?: { address: string }, sale?: { address: string }, metadata?: { name?: string }, collection?: { name?: string }, verified?: boolean, previews?: { resolution: string, url: string }[] }>(`nfts/${a.toRawString()}`)
    if (!item.value?.equals(a)) return
    itemInfo.value = {
      owner: r.owner ? Addr.parse(r.owner.address) : null,
      onSale: !!r.sale,
      name: r.metadata?.name ?? 'Unnamed item',
      collection: r.collection?.name ?? null,
      verified: !!r.verified,
      image: r.previews?.find(p => p.resolution === '100x100')?.url ?? null
    }
  }
  catch (e) {
    itemError.value = e
  }
  finally {
    loading.value = false
  }
}
watch([() => item.value?.toRawString(), network], () => lookup())

// ---------------------------------------------------------------- form
const newOwnerText = ref('')
const newOwner = shallowRef<Address | null>(null)
const destText = ref('')
const dest = shallowRef<Address | null>(null)
const responseText = ref('')
const response = shallowRef<Address | null>(null)
const fwdText = ref('0.000000001')
const fwd = computed(() => nanoOf(fwdText.value))
const fwdKind = ref<PayloadKind>('none')
const fwdValue = ref('')
const customText = ref('')
const withContent = ref(true)
const queryText = ref('0')
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

const sender = computed(() => (tc.wallet.value ? Addr.parse(tc.wallet.value.address) : null))

function example() {
  if (isTestnet.value) useTonNetwork().toggle()
  action.value = 'transfer'
  // Voodoo Doll #9474, a Telegram gift NFT; recipient from its real transfer FcubZ0oN… (toncenter).
  itemText.value = 'EQCt7KtO8cKjdPeRZeo8A21MNkSxBgIuAfFSd0pKi2Xg3TeB'
  newOwnerText.value = 'UQCyrL4e7npH88j1QO5JIAP5EWt6VsBLiC0P0HpZNyDAYIGB'
  fwdKind.value = 'comment'
  fwdValue.value = 'A gift for you'
}

const built = computed<{ body?: ReturnType<typeof buildNftBody>, error?: string }>(() => {
  try {
    const queryId = parseQueryId(queryText.value)
    const fallback = sender.value ?? null
    let params: NftParams
    switch (action.value) {
      case 'transfer':
        if (!newOwner.value) return { error: 'Enter the new owner address.' }
        if (fwd.value === null) return { error: 'Enter a forward amount (0 for no notification).' }
        if (responseText.value.trim() && !response.value) return { error: 'The response destination is not a valid address.' }
        params = {
          action: 'transfer',
          p: { queryId, newOwner: newOwner.value, responseDestination: responseText.value.trim() ? response.value : fallback, forwardAmount: fwd.value, forwardPayload: buildPayload(fwdKind.value, fwdValue.value), customPayload: optionalBoc(customText.value) }
        }
        break
      case 'prove':
      case 'request':
        if (!dest.value) return { error: 'Enter the destination that should receive the proof / owner info.' }
        params = { action: action.value, p: { queryId, dest: dest.value, forwardPayload: buildPayload(fwdKind.value, fwdValue.value), withContent: withContent.value } }
        break
      default:
        params = { action: action.value, p: { queryId } }
    }
    return { body: buildNftBody(params) }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})

const messages = computed<TonConnectMessage[] | null>(() => {
  if (!built.value.body || !item.value || attach.value === null) return null
  return [{ address: item.value.toString({ bounceable: true, testOnly: isTestnet.value }), amount: attach.value, payload: built.value.body }]
})
const link = computed(() => (messages.value && item.value ? transferLink(item.value, attach.value!, built.value.body, null, isTestnet.value) : null))
const blocked = computed(() => senderProblem(action.value, itemInfo.value, sender.value))
const transferNoResponse = computed(() => action.value === 'transfer' && !responseText.value.trim() && !sender.value)
</script>

<template>
  <div class="space-y-6">
    <UFormField label="Message">
      <USelect v-model="action" :items="actionItems" size="lg" class="w-full sm:w-80" />
    </UFormField>
    <p class="text-sm text-muted">
      {{ info.about }}
      <UBadge :color="info.sender === 'anyone' ? 'success' : 'warning'" variant="subtle" :label="info.sender === 'anyone' ? 'Anyone can send it' : info.sender === 'owner' ? 'Only the owner can send it' : 'Only the SBT authority can send it'" class="ml-1" />
    </p>

    <AddressInput v-model="itemText" :label="info.sbt ? 'SBT item address' : 'NFT item address'" required @parsed="item = $event" />
    <UButton v-if="!itemText" label="Try a real mainnet NFT (Telegram gift)" icon="i-lucide-sparkles" variant="link" size="sm" class="-mt-4 px-0" @click="example" />

    <LoadingState v-if="loading" label="Reading the item…" />
    <ErrorNotice v-else-if="itemError" :error="itemError" title="Could not read this item" @retry="lookup" />
    <div v-else-if="itemInfo" class="flex items-start gap-3 rounded-lg border border-default p-3" data-testid="item-info">
      <img v-if="itemInfo.image" :src="itemInfo.image" alt="" class="size-14 shrink-0 rounded-md object-cover">
      <div class="min-w-0 flex-1 text-sm">
        <div class="font-medium text-highlighted">
          {{ itemInfo.name }}
        </div>
        <div class="text-muted">
          {{ itemInfo.collection ?? 'No collection' }}
          <UBadge v-if="itemInfo.verified" label="Verified" color="success" variant="subtle" size="sm" class="ml-1" />
          <UBadge v-if="itemInfo.onSale" label="On sale" color="warning" variant="subtle" size="sm" class="ml-1" />
        </div>
        <div v-if="itemInfo.owner" class="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
          Owner: <AddressLink :address="itemInfo.owner.toRawString()" :bounceable="false" />
        </div>
      </div>
    </div>

    <template v-if="action === 'transfer'">
      <AddressInput v-model="newOwnerText" label="New owner" required @parsed="newOwner = $event" />
      <PayloadField v-model:kind="fwdKind" v-model:text="fwdValue" label="Forward payload" hint="Sent to the new owner with ownership_assigned" />
    </template>
    <template v-else-if="action === 'prove' || action === 'request'">
      <AddressInput v-model="destText" label="dest: who receives the answer" required @parsed="dest = $event" />
      <PayloadField v-model:kind="fwdKind" v-model:text="fwdValue" label="forward_payload (always sent as a ref; empty cell if none)" />
      <USwitch v-model="withContent" label="with_content: include the item's content in the answer" />
    </template>

    <UCollapsible class="rounded-lg border border-default">
      <UButton label="Advanced: amounts, response address, query id" color="neutral" variant="ghost" trailing-icon="i-lucide-chevron-down" block class="justify-between" />
      <template #content>
        <div class="grid gap-4 p-4 sm:grid-cols-2">
          <AmountInput v-if="action === 'transfer'" v-model="fwdText" label="Forward amount (forward_amount)" />
          <AmountInput v-model="attachText" :label="`${COIN_SYMBOL} attached`" @update:model-value="attachTouched = true" />
          <AddressInput v-if="action === 'transfer'" v-model="responseText" label="Response destination (gets the excess)" placeholder="Default: your connected wallet" @parsed="response = $event" />
          <UFormField label="Query id" hint="uint64, echoed in replies">
            <UInput v-model="queryText" class="w-full" :ui="{ base: 'font-mono' }" inputmode="numeric" />
          </UFormField>
          <UFormField v-if="action === 'transfer'" label="Custom payload (BOC, optional)" class="sm:col-span-2">
            <UTextarea v-model="customText" :rows="2" autoresize class="w-full" :ui="{ base: 'font-mono text-xs' }" placeholder="te6cc…" />
          </UFormField>
        </div>
      </template>
    </UCollapsible>
    <p class="-mt-3 text-xs text-muted">
      Recommended attachment: {{ formatCoin(recommended) }}. Unused gas returns to the response address.
    </p>

    <UAlert v-if="built.error" color="neutral" variant="subtle" icon="i-lucide-info" :description="built.error" />
    <UAlert v-if="transferNoResponse" color="warning" variant="subtle" icon="i-lucide-triangle-alert" description="No response destination: the excess gas will not be returned. Connect your wallet or enter one under Advanced." />

    <template v-if="built.body">
      <BodyOutput :body="built.body" :link="link" />
      <SendPanel
        v-if="messages"
        :messages="messages"
        :purpose="action === 'transfer' ? 'transfer this NFT' : 'send this message'"
        :confirm="action === 'destroy' ? 'I understand destroying this SBT is permanent' : action === 'revoke' ? 'I understand revoking this SBT is permanent' : action === 'transfer' ? 'I checked the new owner address: NFT transfers cannot be undone' : undefined"
        :blocked="blocked"
      />
    </template>
  </div>
</template>
