<script setup lang="ts">
import type { Address } from '@ton/core'
import { balanceNote, feeReserve } from '~/lib/bulk-actions/fees'
import type { OwnedJetton, Recipient } from '~/lib/wallet-actions/core'
import { fetchJettons, maxMessages, newQueryId } from '~/lib/wallet-actions/core'
import OwnerBar from '~/lib/wallet-actions/OwnerBar.vue'
import RecipientInput from '~/lib/wallet-actions/RecipientInput.vue'
import SendFlow from '~/lib/wallet-actions/SendFlow.vue'
import { formatJettonAmount } from '~/utils/ton/jetton'
import type { OwnedNft, Selectable, TonapiNft } from './logic'
import { assetGas, buildAssetMessages, buildGramSweep, JETTON_GAS, NFT_GAS, SWEEP_RESERVE, selectJettons, selectNfts, toOwnedNft } from './logic'

// Example: a real mainnet v4R2 wallet with USD₮, tsTON, two .ton domains and some spam; target: a real wallet.
const EXAMPLE_OWNER = 'UQAb-BAv6qky3RZ9WDZW3ueqUddNskuaVpNt9hByhbI74hZ3'
const EXAMPLE_TARGET = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI'

const tc = useTonConnect()
const { isTestnet, network } = useTonNetwork()
const tonapi = useTonapi(network)
const toncenter = useToncenter(network)

const owner = shallowRef<Address | null>(null)
const to = ref('')
const target = shallowRef<Recipient | null>(null)

const jettons = ref<Selectable<OwnedJetton>[]>([])
const nfts = ref<Selectable<OwnedNft>[]>([])
const balance = ref<bigint | null>(null)
const loading = ref(false)
const loadError = ref<unknown>(null)
let session = 0

async function fetchNfts(raw: string): Promise<TonapiNft[]> {
  const out: TonapiNft[] = []
  for (let offset = 0; ; offset += 1000) {
    const r = await tonapi.get<{ nft_items: TonapiNft[] }>(`accounts/${raw}/nfts`, { indirect_ownership: false, limit: 1000, offset })
    out.push(...r.nft_items)
    if (r.nft_items.length < 1000) return out
  }
}

async function loadBalance() {
  const o = owner.value
  if (!o) return
  balance.value = BigInt(await toncenter.v2<string>('getAddressBalance', { address: o.toRawString() }))
}

async function load() {
  const my = ++session
  jettons.value = []
  nfts.value = []
  balance.value = null
  loadError.value = null
  const o = owner.value
  if (!o) return
  loading.value = true
  try {
    const raw = o.toRawString()
    const [j, n] = await Promise.all([
      fetchJettons(tonapi.get, o),
      fetchNfts(raw),
      loadBalance()
    ])
    if (my !== session) return
    jettons.value = selectJettons(j)
    nfts.value = selectNfts(n.map(toOwnedNft))
  }
  catch (e) {
    if (my === session) loadError.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}
watch(owner, load)

const balanceError = ref<unknown>(null)
const refreshing = ref(false)
async function refreshBalance() {
  refreshing.value = true
  balanceError.value = null
  try {
    await loadBalance()
  }
  catch (e) {
    balanceError.value = e
  }
  finally {
    refreshing.value = false
  }
}

function example() {
  to.value = EXAMPLE_TARGET
}

function setAll(list: Selectable<unknown>[], on: boolean) {
  for (const s of list) if (!s.disabled) s.include = on
}

const chosenNfts = computed(() => nfts.value.filter(s => s.include).map(s => s.item))
const chosenJettons = computed(() => jettons.value.filter(s => s.include).map(s => s.item))
const spamCount = computed(() => nfts.value.filter(s => s.item.trust === 'blacklist').length + jettons.value.filter(s => s.item.verification === 'blacklist').length)

const sameWallet = computed(() => !!owner.value && !!target.value && target.value.address.equals(owner.value))
const targetBlocked = computed(() => {
  if (!target.value) return 'Enter the new wallet address above.'
  if (sameWallet.value) return 'This is the wallet you are moving from. Enter the new wallet\'s address.'
  if (target.value.blocked) return 'The new address is not a wallet (see the warning above).'
  // Everything moves non-bounceable: only a wallet can be trusted to keep it (a contract may lose it for good).
  if (target.value.account?.status === 'active' && target.value.account.is_wallet === false) return 'The new address is a smart contract, not a wallet. Enter the address from your new wallet app.'
  return null
})

const assetMessages = computed(() => {
  const t = target.value
  if (!t || targetBlocked.value) return []
  const q0 = newQueryId() * 1000n
  return buildAssetMessages({ nfts: chosenNfts.value, jettons: chosenJettons.value, target: t.address, testnet: isTestnet.value, queryId: i => q0 + BigInt(i) })
})
const perRequest = computed(() => maxMessages(tc.wallet.value?.device.features))
const gas = computed(() => assetGas(chosenNfts.value.length, chosenJettons.value.length))
const reserve = computed(() => feeReserve(chosenNfts.value.length + chosenJettons.value.length, perRequest.value))
const gasNote = computed(() => balanceNote(balance.value, gas.value, reserve.value))
const assetBlocked = computed(() => targetBlocked.value ?? (gasNote.value?.level === 'error' ? `${gasNote.value.text} Untick some items or top up the old wallet first.` : null))

const gramMessage = computed(() => (target.value && !targetBlocked.value && balance.value !== null ? buildGramSweep(balance.value, target.value.destination) : null))
const gramMessages = computed(() => (gramMessage.value ? [gramMessage.value] : []))
const gramBlocked = computed(() => targetBlocked.value ?? (balance.value !== null && !gramMessage.value ? `Nothing left to move: the balance is at most the ${formatCoin(SWEEP_RESERVE)} fee reserve.` : null))
</script>

<template>
  <div class="space-y-6">
    <OwnerBar v-model:owner="owner" :example="EXAMPLE_OWNER" example-label="Try an example (v4R2 wallet with domains)" @example="example" />

    <RecipientInput v-model="to" purpose="jetton" label="New wallet (where everything goes)" :self="owner" @resolved="target = $event" />
    <UAlert v-if="target && targetBlocked" color="error" variant="subtle" icon="i-lucide-octagon-x" :description="targetBlocked" data-testid="target-blocked" />
    <p class="text-xs text-muted">
      Copy the address from the new wallet's Receive screen. Make sure you have that wallet's recovery phrase before moving anything: transfers cannot be undone.
    </p>

    <LoadingState v-if="loading" label="Loading tokens, NFTs and balance…" />
    <ErrorNotice v-else-if="loadError" :error="loadError" title="Could not load the wallet's assets" @retry="load" />

    <template v-else-if="owner && balance !== null">
      <section class="space-y-4" data-testid="sweep-assets">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Step 1 · Tokens and NFTs
          </h3>
          <span class="text-sm text-muted">{{ chosenJettons.length }} tokens, {{ chosenNfts.length }} NFTs selected<template v-if="spamCount"> · {{ spamCount }} spam items left behind</template></span>
        </div>

        <p v-if="!jettons.length && !nfts.length" class="text-sm text-muted">
          No tokens or NFTs on this wallet. Go straight to step 2.
        </p>

        <div v-if="jettons.length" class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium tracking-wide text-muted uppercase">Tokens ({{ formatCoin(JETTON_GAS) }} gas each)</span>
            <span class="flex gap-1">
              <UButton label="All" size="xs" variant="ghost" color="neutral" @click="setAll(jettons, true)" />
              <UButton label="None" size="xs" variant="ghost" color="neutral" @click="setAll(jettons, false)" />
            </span>
          </div>
          <ul class="divide-y divide-default rounded-lg border border-default">
            <li v-for="s in jettons" :key="s.item.master" class="flex items-start gap-3 px-3 py-2">
              <UCheckbox v-model="s.include" :disabled="s.disabled" :aria-label="`Move ${s.item.symbol}`" class="mt-0.5" />
              <img v-if="s.item.image && s.item.verification !== 'blacklist'" :src="s.item.image" alt="" class="size-6 shrink-0 rounded-full" loading="lazy">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span class="truncate font-medium text-highlighted">{{ s.item.symbol }} <span class="font-normal text-muted">{{ s.item.name }}</span></span>
                  <span class="font-mono text-sm">{{ formatJettonAmount(s.item.balance - s.item.locked, s.item.decimals) }}</span>
                </div>
                <p v-if="s.reason" class="text-xs text-muted">
                  {{ s.reason }}
                </p>
              </div>
            </li>
          </ul>
        </div>

        <div v-if="nfts.length" class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium tracking-wide text-muted uppercase">NFTs, domains, usernames ({{ formatCoin(NFT_GAS) }} gas each)</span>
            <span class="flex gap-1">
              <UButton label="All" size="xs" variant="ghost" color="neutral" @click="setAll(nfts, true)" />
              <UButton label="None" size="xs" variant="ghost" color="neutral" @click="setAll(nfts, false)" />
            </span>
          </div>
          <ul class="max-h-96 divide-y divide-default overflow-y-auto rounded-lg border border-default">
            <li v-for="s in nfts" :key="s.item.address" class="flex items-start gap-3 px-3 py-2">
              <UCheckbox v-model="s.include" :disabled="s.disabled" :aria-label="`Move ${s.item.name}`" class="mt-0.5" />
              <img v-if="s.item.image && s.item.trust !== 'blacklist'" :src="s.item.image" alt="" class="size-8 shrink-0 rounded" loading="lazy">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="break-all text-highlighted">{{ s.item.name }}</span>
                  <UBadge v-if="s.item.kind !== 'nft'" color="primary" variant="subtle" size="sm" :label="s.item.kind === 'domain' ? '.ton domain' : 'Telegram'" />
                </div>
                <p class="text-xs text-muted">
                  {{ s.reason ?? s.item.collection ?? 'No collection' }}
                </p>
              </div>
            </li>
          </ul>
        </div>

        <div v-if="chosenJettons.length || chosenNfts.length" class="space-y-2 text-sm">
          <p>
            Gas attached: <TokenAmount :nano="gas" /> plus network fees. The unused part arrives at the new wallet. Old wallet balance: <TokenAmount :nano="balance" :max-decimals="4" />.
          </p>
          <UAlert v-if="gasNote" :color="gasNote.level === 'error' ? 'error' : 'warning'" variant="subtle" icon="i-lucide-triangle-alert" :description="gasNote.text" />
          <SendFlow
            :messages="assetMessages"
            purpose="move your tokens and NFTs"
            label="Move tokens and NFTs"
            :blocked="assetBlocked"
            confirm="I control the new wallet and have its recovery phrase. These transfers cannot be undone."
          />
        </div>
      </section>

      <USeparator />

      <section class="space-y-3" data-testid="sweep-gram">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Step 2 · Remaining {{ COIN_SYMBOL }}
        </h3>
        <p class="text-sm text-muted">
          Do this last, after step 1 is confirmed: the token and NFT transfers need {{ COIN_SYMBOL }} for gas. TonConnect cannot use "send everything" (mode 128), so {{ formatCoin(SWEEP_RESERVE) }} stays behind to pay this transfer's fee. Press Refresh balance once step 1 is confirmed so the amount below is up to date.
        </p>
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span>Current balance: <TokenAmount :nano="balance" :max-decimals="4" /></span>
          <UButton label="Refresh balance" icon="i-lucide-refresh-cw" size="xs" variant="outline" color="neutral" :loading="refreshing" data-testid="refresh-balance" @click="refreshBalance" />
        </div>
        <ErrorNotice v-if="balanceError" :error="balanceError" title="Could not read the balance" @retry="refreshBalance" />
        <SendFlow
          :messages="gramMessages"
          :purpose="`move your ${COIN_SYMBOL}`"
          :label="`Move ${COIN_SYMBOL}`"
          :blocked="gramBlocked"
          :confirm="`Step 1 is done (or I have nothing else to move). Send the remaining ${COIN_SYMBOL} to the new wallet.`"
        />
      </section>

      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-info"
        title="Not moved by this tool"
        description="Staking deposits in pools (TON Whales, nominator pools), vesting and lockup contracts, NFTs listed for sale, and items with a different owner contract stay where they are. Withdraw or cancel them first. Liquid staking tokens (tsTON, stGRAM, hGRAM) are jettons and are moved."
      />
    </template>
  </div>
</template>
