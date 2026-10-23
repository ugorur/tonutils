<script setup lang="ts">
import type { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { Recipient } from '~/lib/wallet-actions/core'
import { newQueryId } from '~/lib/wallet-actions/core'
import OwnerBar from '~/lib/wallet-actions/OwnerBar.vue'
import RecipientInput from '~/lib/wallet-actions/RecipientInput.vue'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import type { OwnedNft, TonapiNft } from './logic'
import { buildNftTransfer, isSbt, toOwnedNft, transferNotes } from './logic'

// TON Foundation's wallet holds Telegram gifts, .ton domains and plenty of spam NFTs: a realistic preview.
const EXAMPLE_OWNER = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'
const LIMIT = 1000

const tonapi = useTonapi()
const toncenter = useToncenter()
const { network } = useTonNetwork()

const owner = shallowRef<Address | null>(null)
const nfts = ref<OwnedNft[]>([])
const truncated = ref(false)
const loading = ref(false)
const error = ref<unknown>(null)
const coinBalance = ref<bigint | null>(null)
const selected = ref<string[]>([])
let pickExample = false
let session = 0

async function load() {
  const my = ++session
  nfts.value = []
  selected.value = []
  coinBalance.value = null
  error.value = null
  const o = owner.value
  if (!o) return
  loading.value = true
  try {
    const [r, bal] = await Promise.all([
      tonapi.get<{ nft_items: TonapiNft[] }>(`accounts/${o.toRawString()}/nfts`, { limit: LIMIT, offset: 0, indirect_ownership: false }),
      toncenter.v2<string>('getAddressBalance', { address: o.toRawString() }).then(BigInt).catch(() => null)
    ])
    if (my !== session) return
    nfts.value = r.nft_items.map(toOwnedNft)
    truncated.value = r.nft_items.length >= LIMIT
    coinBalance.value = bal
    if (pickExample) selectExample()
    pickExample = false
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
watch([owner, network], load)

// ---- list
const query = ref('')
const spamVisible = ref(false)
const spamCount = computed(() => nfts.value.filter(n => n.trust === 'blacklist').length)
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return nfts.value.filter(n => (spamVisible.value || n.trust !== 'blacklist' || selected.value.includes(n.address))
    && (!q || n.name.toLowerCase().includes(q) || (n.collection ?? '').toLowerCase().includes(q) || n.address.includes(q)))
})
function toggle(a: string) {
  selected.value = selected.value.includes(a) ? selected.value.filter(x => x !== a) : [...selected.value, a]
}
/** Previews that failed to load (tonapi's image proxy returns 422 for some): show the placeholder. */
const broken = reactive(new Set<string>())
const KIND_LABEL = { domain: '.ton domain', username: 'Username', number: 'Number', nft: '' } as const

// ---- SBT check for the selection (toncenter address book reports the 'sbt' interface)
const interfaces = ref<Record<string, string[] | null>>({})
const checking = ref(false)
const checkError = ref<unknown>(null)
let checkTimer: ReturnType<typeof setTimeout> | undefined
async function checkSelection() {
  const todo = selected.value.filter(a => !(a in interfaces.value)).slice(0, 100)
  if (!todo.length) return
  checking.value = true
  checkError.value = null
  try {
    const r = await toncenter.v3<Record<string, { interfaces?: string[] | null }>>(`addressBook?${todo.map(a => `address=${encodeURIComponent(a)}`).join('&')}`)
    const next = { ...interfaces.value }
    for (const a of todo) next[a] = null
    for (const [k, v] of Object.entries(r)) next[k.toLowerCase()] = v.interfaces ?? null
    interfaces.value = next
  }
  catch (e) {
    checkError.value = e
    return
  }
  finally {
    checking.value = false
  }
  // More than 100 selected: next page.
  if (selected.value.some(a => !(a in interfaces.value))) await checkSelection()
}
watch(selected, () => {
  clearTimeout(checkTimer)
  checkTimer = setTimeout(checkSelection, 400)
})
onBeforeUnmount(() => clearTimeout(checkTimer))

// ---- transfer
const chosen = computed(() => nfts.value.filter(n => selected.value.includes(n.address)))
const to = ref('')
const recipient = shallowRef<Recipient | null>(null)
const comment = ref('')
const queryId = newQueryId()
const notes = computed(() => transferNotes(chosen.value, interfaces.value, coinBalance.value))
const unchecked = computed(() => chosen.value.some(n => !(n.address in interfaces.value)))
const messages = computed<TonConnectMessage[]>(() => {
  const o = owner.value
  const r = recipient.value
  if (!o || !r || r.blocked || !chosen.value.length || unchecked.value || notes.value.some(n => n.level === 'error')) return []
  return chosen.value.map((n, i) => buildNftTransfer({ item: n.address, owner: o, newOwner: r.address, comment: comment.value, queryId: queryId + BigInt(i) }))
})

function selectExample() {
  const domain = nfts.value.find(n => n.kind === 'domain')
  if (domain) selected.value = [domain.address]
}
function example() {
  to.value = 'foundation.ton'
  comment.value = 'Here you go'
  if (nfts.value.length) selectExample()
  else pickExample = true
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3" aria-labelledby="tn-pick">
      <h3 id="tn-pick" class="font-display text-sm font-semibold text-highlighted">
        1. Choose NFTs
      </h3>
      <OwnerBar v-model:owner="owner" :example="EXAMPLE_OWNER" example-label="Try an example (TON Foundation's NFTs)" @example="example" />
      <LoadingState v-if="loading" label="Loading NFTs…" />
      <ErrorNotice v-if="error" :error="error" title="Could not load the NFTs" @retry="load" />
      <template v-if="owner && !loading && !error">
        <div class="flex flex-wrap items-center gap-3">
          <UInput v-if="nfts.length > 6" v-model="query" icon="i-lucide-search" placeholder="Filter by name or collection" size="sm" class="w-full sm:w-64" />
          <USwitch v-if="spamCount" v-model="spamVisible" size="sm" :label="`Show spam (${spamCount})`" />
          <span v-if="selected.length" class="text-sm text-muted">{{ selected.length }} selected</span>
          <UButton v-if="selected.length" label="Clear" size="xs" variant="ghost" color="neutral" @click="selected = []" />
        </div>
        <p v-if="truncated" class="text-xs text-muted">
          Showing the first {{ LIMIT }} NFTs.
        </p>
        <ul v-if="shown.length" class="grid max-h-[28rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4" role="listbox" aria-multiselectable="true" data-testid="nft-list">
          <li
            v-for="n in shown"
            :key="n.address"
            role="option"
            :aria-selected="selected.includes(n.address)"
            tabindex="0"
            class="relative cursor-pointer overflow-hidden rounded-lg border p-2 text-xs focus-visible:outline-2 focus-visible:outline-primary"
            :class="selected.includes(n.address) ? 'border-primary bg-primary/10' : 'border-default hover:bg-elevated/60'"
            @click="toggle(n.address)"
            @keydown.enter.prevent="toggle(n.address)"
            @keydown.space.prevent="toggle(n.address)"
          >
            <UIcon :name="selected.includes(n.address) ? 'i-lucide-square-check' : 'i-lucide-square'" class="absolute top-3 left-3 size-4 rounded bg-default" :class="selected.includes(n.address) ? 'text-primary' : 'text-dimmed'" />
            <img v-if="n.image && !broken.has(n.address)" :src="n.image" alt="" class="aspect-square w-full rounded-md bg-elevated object-cover" loading="lazy" @error="broken.add(n.address)">
            <div v-else class="grid aspect-square w-full place-items-center rounded-md bg-elevated text-muted">
              <UIcon name="i-lucide-image" class="size-6" />
            </div>
            <div class="mt-1.5 truncate font-medium text-highlighted" :title="n.name">
              {{ n.name }}
            </div>
            <div class="truncate text-muted">
              {{ n.collection ?? 'No collection' }}
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <UBadge v-if="KIND_LABEL[n.kind]" color="primary" variant="subtle" size="sm" :label="KIND_LABEL[n.kind]" />
              <UBadge v-if="n.trust === 'blacklist'" color="error" variant="subtle" size="sm" label="Spam" />
              <UBadge v-if="isSbt(interfaces[n.address])" color="warning" variant="subtle" size="sm" label="Soulbound" />
            </div>
          </li>
        </ul>
        <p v-else class="rounded-lg border border-default px-3 py-6 text-center text-sm text-muted">
          {{ nfts.length ? 'No NFTs match.' : 'This wallet holds no NFTs (items listed for sale are held by the marketplace and do not show here).' }}
        </p>
      </template>
    </section>

    <section v-if="chosen.length" class="space-y-4 border-t border-default pt-5" aria-labelledby="tn-send">
      <h3 id="tn-send" class="font-display text-sm font-semibold text-highlighted">
        2. Send {{ chosen.length === 1 ? chosen[0]!.name : `${chosen.length} NFTs` }}
      </h3>
      <RecipientInput v-model="to" label="New owner" purpose="nft" :comment="comment" :self="owner" @resolved="recipient = $event" />
      <UFormField label="Comment (optional)">
        <UInput v-model="comment" class="w-full" placeholder="Shown to the new owner" />
      </UFormField>
      <LoadingState v-if="checking" label="Checking whether the selected items can be transferred…" />
      <ErrorNotice v-if="checkError" :error="checkError" title="Could not check the selected items" @retry="checkSelection" />
      <UAlert
        v-for="(n, i) in notes"
        :key="i"
        :color="n.level === 'error' ? 'error' : n.level === 'warning' ? 'warning' : 'info'"
        variant="subtle"
        :icon="n.level === 'info' ? 'i-lucide-info' : 'i-lucide-triangle-alert'"
        :description="n.text"
      />
    </section>

    <SendFlow
      v-if="chosen.length"
      :messages="messages"
      purpose="transfer NFTs"
      :confirm="chosen.length > 1 || chosen.some(n => n.kind !== 'nft') ? 'I checked the new owner\'s address: a transfer to the wrong address cannot be reversed.' : undefined"
      :label="chosen.length === 1 ? 'Transfer NFT' : `Transfer ${chosen.length} NFTs`"
    />
  </div>
</template>
