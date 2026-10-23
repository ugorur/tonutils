<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { accountStates, chunk, fetchAccountNfts, maxMessagesOf, previewUrl } from '~/lib/nfts-write/chain'
import SentNotice from '~/lib/nfts-write/SentNotice.vue'
import { useSend } from '~/lib/nfts-write/useSend'
import { canReprice, cancelMessages, cancelTotal, classifyListing, feeSplit, type Listing, marketplaceLink, REPRICE_AMOUNT, repriceBody } from './logic'

const tc = useTonConnect()
const tonapi = useTonapi()
const ton = useToncenter()
const { network, isTestnet } = useTonNetwork()

const addrText = ref('')
const addr = computed(() => {
  try {
    return addrText.value.trim() ? Address.parse(addrText.value.trim()) : null
  }
  catch {
    return null
  }
})
const walletAddr = computed(() => (tc.wallet.value && !tc.networkMismatch.value ? Address.parse(tc.wallet.value.address) : null))
watch(walletAddr, (a) => {
  if (a && !addrText.value) {
    addrText.value = a.toString({ bounceable: false, testOnly: isTestnet.value })
    nextTick(load)
  }
}, { immediate: true })
const isSeller = computed(() => !!(addr.value && walletAddr.value?.equals(addr.value)))

const listings = shallowRef<Listing[]>([])
const loadedFor = shallowRef<Address | null>(null)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
const selected = ref<Set<string>>(new Set())
const truncated = ref(false)

async function load() {
  if (!addr.value) return
  const seller = addr.value
  loading.value = true
  error.value = null
  listings.value = []
  selected.value = new Set()
  try {
    stage.value = 'Finding NFTs you have on sale (tonapi)…'
    const { items, truncated: more } = await fetchAccountNfts(tonapi.get, seller.toRawString(), { indirect: true, maxItems: 1000, onPage: n => (stage.value = `Scanned ${n} NFTs…`) })
    truncated.value = more
    const onSale = items.filter(n => n.sale)
    stage.value = `Checking ${onSale.length} sale contract${onSale.length === 1 ? '' : 's'} on chain (toncenter)…`
    const states = onSale.length ? await accountStates(ton.v3, onSale.map(n => n.sale!.address), true) : new Map()
    listings.value = onSale.map((n) => {
      const st = states.get(Address.parse(n.sale!.address).toRawString().toUpperCase())
      return classifyListing(n, st?.code_hash, st?.data_boc, seller)
    })
    loadedFor.value = seller
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function example() {
  addrText.value = 'UQCd1mWZgdCx_x7EfgKNDC84DAGJLAX8qyrJC-g5WPybFUNv'
  nextTick(load)
}

function toggle(sale: string, on: boolean) {
  const s = new Set(selected.value)
  if (on) s.add(sale)
  else s.delete(sale)
  selected.value = s
}

const STATUS: Record<Listing['status'], { label: string, color: 'success' | 'neutral' | 'warning' | 'error' }> = {
  'ready': { label: 'Can cancel', color: 'success' },
  'not-yours': { label: 'Another seller', color: 'neutral' },
  'auction': { label: 'Auction: manage on the marketplace', color: 'neutral' },
  'unknown-contract': { label: 'Unknown sale contract', color: 'warning' },
  'complete': { label: 'Already closed', color: 'neutral' }
}

const fr = (a: string, bounceable = true) => Address.parse(a).toString({ bounceable, testOnly: isTestnet.value })
const ready = computed(() => listings.value.filter(l => l.status === 'ready'))
const others = computed(() => listings.value.filter(l => l.status !== 'ready'))

// ---------------------------------------------------------------- cancel
const maxMsgs = computed(() => maxMessagesOf(tc.wallet.value?.device as { features?: (string | { name: string, maxMessages?: number })[] } | undefined))
const chosen = computed(() => ready.value.filter(l => selected.value.has(l.sale)))
const batches = computed(() => chunk(chosen.value, maxMsgs.value))
const current = computed(() => batches.value[0] ?? [])
const cancelMsgs = computed<TonConnectMessage[]>(() => cancelMessages(current.value, isTestnet.value))
const cancelSender = useSend()
async function sendCancel() {
  const done = new Set(current.value.map(l => l.sale))
  const out = await cancelSender.send(cancelMsgs.value)
  if (out?.trace) {
    // Drop the sent ones from the list; a fresh load shows what really changed.
    listings.value = listings.value.filter(l => !done.has(l.sale) || out.failed.length > 0)
    if (out.failed.length) await load()
  }
}

// ---------------------------------------------------------------- reprice
const repricing = shallowRef<Listing | null>(null)
const newPriceText = ref('')
const newPrice = ref<bigint | null>(null)
function startReprice(l: Listing) {
  repricing.value = l
  newPriceText.value = ''
  repriceSender.last.value = null
  repriceSender.error.value = null
}
const reprice = computed(() => {
  const l = repricing.value
  if (!l?.state || !newPrice.value) return null
  try {
    const body = repriceBody(l.state, newPrice.value)
    return { split: feeSplit(l.state, newPrice.value), messages: [{ address: fr(l.sale), amount: REPRICE_AMOUNT, payload: body }] as TonConnectMessage[] }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})
const repriceSender = useSend()
async function sendReprice() {
  if (!reprice.value || !('messages' in reprice.value) || !reprice.value.messages) return
  const out = await repriceSender.send(reprice.value.messages)
  if (out?.trace && !out.failed.length) await load()
}

const priceLabel = (l: Listing) => {
  const p = l.nft.sale!.price
  if (p.currency_type === 'native' || !p.currency_type) return null
  return `${formatUnits(BigInt(p.value), p.decimals ?? 9)} ${p.token_name ?? ''}`.trim()
}
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      Lists every NFT an address has on sale and checks each sale contract on chain. The seller can cancel listings (the NFT comes back)
      or change prices straight from the wallet. Supports Getgems fixed-price contracts v2 to v4r1, which other marketplaces also use.
    </p>

    <form class="space-y-2" @submit.prevent="load">
      <AddressInput v-model="addrText" label="Seller address" placeholder="Your wallet (filled in when you connect)" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton type="submit" label="Find listings" icon="i-lucide-search" :loading="loading" :disabled="!addr" />
        <UButton label="Try a real seller" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
    </form>
    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not load listings" @retry="load" />

    <template v-if="loadedFor && !loading">
      <p v-if="!listings.length" class="rounded-lg border border-dashed border-accented p-4 text-sm text-muted">
        No NFTs on sale for this address on {{ network }}.
      </p>
      <p v-if="truncated" class="text-xs text-warning">
        This address holds more than 1000 NFTs: only listings among the first 1000 are shown.
      </p>

      <div v-if="listings.length" class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          {{ listings.length }} listing{{ listings.length === 1 ? '' : 's' }} · {{ ready.length }} cancellable here
        </h3>
        <div v-if="ready.length" class="flex gap-2">
          <UButton label="Select all" size="xs" color="neutral" variant="soft" @click="selected = new Set(ready.map(l => l.sale))" />
          <UButton label="None" size="xs" color="neutral" variant="ghost" @click="selected = new Set()" />
        </div>
      </div>

      <ul v-if="listings.length" class="divide-y divide-default rounded-lg border border-default" data-testid="listings">
        <li v-for="l in [...ready, ...others]" :key="l.sale" class="flex gap-3 p-3">
          <UCheckbox
            class="mt-1"
            :model-value="selected.has(l.sale)"
            :disabled="l.status !== 'ready'"
            :aria-label="`Select ${l.nft.metadata.name ?? 'NFT'}`"
            @update:model-value="toggle(l.sale, !!$event)"
          />
          <img v-if="previewUrl(l.nft)" :src="previewUrl(l.nft)" alt="" class="size-12 shrink-0 rounded-md bg-elevated object-cover" loading="lazy" @error="($event.target as HTMLImageElement).style.visibility = 'hidden'">
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3">
              <span class="truncate font-medium text-highlighted">{{ l.nft.metadata.name ?? `#${l.nft.index}` }}</span>
              <span class="font-mono text-sm text-highlighted">
                <template v-if="priceLabel(l)">{{ priceLabel(l) }}</template>
                <TokenAmount v-else :nano="l.state?.price ?? l.nft.sale!.price.value" />
              </span>
            </div>
            <div class="text-xs text-muted">
              {{ l.nft.collection?.name ?? 'No collection' }} · {{ l.nft.sale!.market.name ?? 'Unnamed marketplace' }} · {{ l.contractLabel }}
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="STATUS[l.status].color" variant="subtle" size="sm" :label="STATUS[l.status].label" />
              <UButton v-if="canReprice(l)" label="Change price" icon="i-lucide-pencil" size="xs" color="neutral" variant="soft" @click="startReprice(l)" />
              <UButton :to="marketplaceLink(l, isTestnet)" target="_blank" rel="noopener" label="Getgems" icon="i-lucide-external-link" size="xs" color="neutral" variant="ghost" />
            </div>
          </div>
        </li>
      </ul>

      <!-- reprice -->
      <section v-if="repricing" class="space-y-4 rounded-lg border border-primary/40 p-4" aria-labelledby="reprice-h">
        <div class="flex items-start justify-between gap-2">
          <h3 id="reprice-h" class="font-display text-sm font-semibold text-highlighted">
            Change the price of {{ repricing.nft.metadata.name ?? 'this NFT' }}
          </h3>
          <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="Close" @click="repricing = null" />
        </div>
        <p class="text-sm text-muted">
          Now <TokenAmount :nano="repricing.state!.price" />. Marketplace fee and royalty keep the same percentages.
        </p>
        <AmountInput v-model="newPriceText" v-model:nano="newPrice" label="New price" />
        <UAlert v-if="reprice && 'error' in reprice" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="reprice.error" />
        <template v-if="reprice && 'split' in reprice && reprice.split">
          <KeyValue
            :items="[
              { label: 'Buyer pays', value: formatCoin(newPrice!), copy: false },
              { label: 'Marketplace fee', value: formatCoin(reprice.split.fee), copy: false },
              { label: 'Royalty to the creator', value: formatCoin(reprice.split.royalty), copy: false },
              { label: 'You receive', value: formatCoin(reprice.split.seller), copy: false }
            ]"
          />
          <UAlert color="neutral" variant="subtle" icon="i-lucide-info" :title="`Below, op ${repricing.state!.version === 'v3r3' ? '0x6c6c2080' : '0xfd135f7b'} = change price (Getgems ${repricing.state!.version})`" :description="`The ${formatCoin(REPRICE_AMOUNT)} attached stays in the sale contract and comes back to you when it sells or you cancel.`" />
          <TxPreview :messages="reprice.messages!" />
          <WalletGate purpose="change the price">
            <UButton label="Change price in wallet" icon="i-lucide-pencil" :disabled="!isSeller" :loading="repriceSender.sending.value" @click="sendReprice" />
          </WalletGate>
          <ErrorNotice :error="repriceSender.error.value" title="Price not changed" />
          <SentNotice v-if="repriceSender.last.value" :outcome="repriceSender.last.value" success="Price changed" />
        </template>
      </section>

      <!-- cancel -->
      <section v-if="chosen.length" class="space-y-4 border-t border-default pt-5" aria-labelledby="cancel-h">
        <div>
          <h3 id="cancel-h" class="font-display text-sm font-semibold text-highlighted">
            Cancel {{ chosen.length }} listing{{ chosen.length === 1 ? '' : 's' }}
          </h3>
          <p class="mt-1 text-sm text-muted">
            Each cancel attaches the minimum the sale contract demands ({{ formatCoin(100_000_000n) }} for v3r3/v4r1, {{ formatCoin(1_000_000_000n) }} for older versions,
            <TokenAmount :nano="cancelTotal(chosen)" /> in total). The contract sends its whole balance on to the NFT, which returns to you with the unused {{ COIN_SYMBOL }}; you pay only network fees.
            <template v-if="batches.length > 1">
              Your wallet takes {{ maxMsgs }} messages at a time, so this needs {{ batches.length }} transactions.
            </template>
          </p>
        </div>
        <TxPreview :messages="cancelMsgs" />
        <p class="text-xs text-muted">
          v3r2, v3r3 and v4r1 accept the text comment "cancel", so your wallet shows it in plain words. v2 and v3 need op 3, which the decoder shows as an unknown op.
        </p>
        <WalletGate purpose="cancel listings">
          <p v-if="!isSeller" class="mb-3 text-sm text-warning">
            The connected wallet is not this seller. Only the seller can cancel.
          </p>
          <UButton
            :label="batches.length > 1 ? `Cancel ${current.length} in wallet (1 of ${batches.length})` : 'Cancel in wallet'"
            icon="i-lucide-circle-x"
            color="error"
            :disabled="!isSeller"
            :loading="cancelSender.sending.value"
            @click="sendCancel"
          />
        </WalletGate>
        <p v-if="cancelSender.stage.value" class="text-sm text-muted">
          {{ cancelSender.stage.value }}
        </p>
      </section>
      <ErrorNotice :error="cancelSender.error.value" title="Not cancelled" />
      <SentNotice v-if="cancelSender.last.value" :outcome="cancelSender.last.value" success="Listings cancelled: the NFTs are back in your wallet" />
    </template>

    <p class="text-xs text-dimmed">
      Listings come from tonapi's index; every sale contract is then read from toncenter and matched against the published Getgems code,
      and only contracts whose on-chain seller is this address are offered for cancelling. Auctions and unknown contracts are left alone.
    </p>
  </div>
</template>
