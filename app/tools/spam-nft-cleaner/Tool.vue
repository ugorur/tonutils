<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { accountStates, chunk, fetchAccountNfts, maxMessagesOf, type TonapiNft } from '~/lib/nfts-write/chain'
import SentNotice from '~/lib/nfts-write/SentNotice.vue'
import { useSend } from '~/lib/nfts-write/useSend'
import { loadSandbox } from '~/utils/lazy'
import { BURN_ADDRESS, burnMessage, type BurnVerdict, checkBurn, type Classified, classifyNft, type Emulator, type SpamClass, TRANSFER_AMOUNT } from './logic'

interface Row { nft: TonapiNft, c: Classified, verdict?: BurnVerdict, burned?: boolean }

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
const isOwner = computed(() => !!(addr.value && walletAddr.value?.equals(addr.value)))
watch(walletAddr, (a) => {
  if (a && !addrText.value) {
    addrText.value = a.toString({ bounceable: false, testOnly: isTestnet.value })
    nextTick(load)
  }
}, { immediate: true })

const rows = shallowRef<Row[]>([])
const selected = ref<Set<string>>(new Set())
const loadedFor = shallowRef<Address | null>(null)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
const truncated = ref(false)

async function load() {
  if (!addr.value) return
  const owner = addr.value
  loading.value = true
  error.value = null
  rows.value = []
  try {
    stage.value = 'Loading NFTs (tonapi)…'
    const r = await fetchAccountNfts(tonapi.get, owner.toRawString(), { maxItems: 1000, onPage: n => (stage.value = `Loaded ${n} NFTs…`) })
    truncated.value = r.truncated
    rows.value = r.items.map(nft => ({ nft, c: classifyNft(nft) }))
    // Only tonapi's scam list is preselected: the text heuristics also hit some legit event and project NFTs.
    selected.value = new Set(rows.value.filter(x => x.c.cls === 'scam').map(x => x.nft.address))
    loadedFor.value = owner
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}
function example() {
  addrText.value = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N'
  nextTick(load)
}
function toggle(a: string, on: boolean) {
  const s = new Set(selected.value)
  if (on) s.add(a)
  else s.delete(a)
  selected.value = s
}

const GROUPS: { cls: SpamClass, title: string, hint: string, color: 'error' | 'warning' | 'neutral' | 'success' }[] = [
  { cls: 'scam', title: 'Flagged as scam', hint: 'On the tonapi / Tonkeeper spam list.', color: 'error' },
  { cls: 'suspicious', title: 'Looks like spam', hint: 'Fake vouchers, "claim" bait, links or bot names in the text. A guess, so nothing here is preselected: tick only what you recognise as spam.', color: 'warning' },
  { cls: 'unverified', title: 'Unverified', hint: 'Not flagged, not verified. Usually legit: check before burning.', color: 'neutral' },
  { cls: 'trusted', title: 'Verified', hint: 'Verified collections and TON DNS domains. Not selectable here.', color: 'success' }
]
const byClass = computed(() => Object.fromEntries(GROUPS.map(g => [g.cls, rows.value.filter(r => r.c.cls === g.cls && !r.burned)])) as Record<SpamClass, Row[]>)
const showTrusted = ref(false)
const showUnverified = ref(false)

// ---------------------------------------------------------------- emulation
const checking = ref(false)
const checkStage = ref('')
const checkError = ref<unknown>(null)
const chosen = computed(() => rows.value.filter(r => selected.value.has(r.nft.address) && !r.burned && r.c.cls !== 'trusted'))
const unchecked = computed(() => chosen.value.filter(r => !r.verdict))

async function check() {
  const owner = loadedFor.value
  if (!owner) return
  const todo = unchecked.value
  checking.value = true
  checkError.value = null
  try {
    checkStage.value = `Reading ${todo.length} NFT contract${todo.length === 1 ? '' : 's'} (toncenter)…`
    const states = await accountStates(ton.v3, todo.map(r => r.nft.address), true)
    checkStage.value = 'Loading the TON emulator (~7 MB, once)…'
    const sb = await loadSandbox()
    const emu = sb as unknown as Emulator
    const verdicts = new Map<string, BurnVerdict>()
    for (const [i, r] of todo.entries()) {
      checkStage.value = `Emulating transfer ${i + 1} of ${todo.length}…`
      const st = states.get(Address.parse(r.nft.address).toRawString().toUpperCase())
      verdicts.set(r.nft.address, st?.code_boc && st.data_boc
        ? await checkBurn(emu, { address: r.nft.address, code: st.code_boc, data: st.data_boc, balance: st.balance }, owner)
        : { ok: false, why: 'error', cost: null, detail: `The contract is ${st?.status ?? 'missing'}: nothing to emulate.` })
    }
    rows.value = rows.value.map(r => (verdicts.has(r.nft.address) ? { ...r, verdict: verdicts.get(r.nft.address) } : r))
  }
  catch (e) {
    checkError.value = e
  }
  finally {
    checking.value = false
  }
}

const VERDICT: Record<string, { label: string, color: 'success' | 'error' | 'warning' | 'neutral' }> = {
  'ok': { label: 'Can be burned', color: 'success' },
  'refuses': { label: 'Refuses transfers', color: 'warning' },
  'keeps-funds': { label: `Trap: keeps your ${COIN_SYMBOL}`, color: 'error' },
  'not-moved': { label: 'Does not move', color: 'warning' },
  'error': { label: 'Could not emulate', color: 'neutral' }
}
const verdictKey = (v: BurnVerdict) => (v.ok ? 'ok' : v.why)

// ---------------------------------------------------------------- burn
const burnable = computed(() => chosen.value.filter(r => r.verdict?.ok))
const traps = computed(() => chosen.value.filter(r => r.verdict && !r.verdict.ok))
const maxMsgs = computed(() => maxMessagesOf(tc.wallet.value?.device as { features?: (string | { name: string, maxMessages?: number })[] } | undefined))
const batches = computed(() => chunk(burnable.value, maxMsgs.value))
const current = computed(() => batches.value[0] ?? [])
const messages = computed<TonConnectMessage[]>(() => (loadedFor.value ? current.value.map(r => burnMessage(r.nft.address, loadedFor.value!, isTestnet.value)) : []))
const estCost = computed(() => burnable.value.reduce((s, r) => s + (r.verdict?.ok ? r.verdict.cost : 0n), 0n))
const confirm = ref(false)
const sender = useSend()
async function burn() {
  const done = new Set(current.value.map(r => r.nft.address))
  const out = await sender.send(messages.value)
  if (out?.trace && !out.failed.length) rows.value = rows.value.map(r => (done.has(r.nft.address) ? { ...r, burned: true } : r))
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="Never open links or “claim” anything from these NFTs"
      description="Spam NFTs are bait for drainer sites. Hiding them in your wallet (Tonkeeper: tap the NFT, then Hide / Report spam) is free and enough. Burning only removes them for good, and many spam contracts are built so that it cannot work: this tool tests each one first."
    />

    <form class="space-y-2" @submit.prevent="load">
      <AddressInput v-model="addrText" label="Wallet address" placeholder="Your wallet (filled in when you connect)" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton type="submit" label="Scan NFTs" icon="i-lucide-scan-search" :loading="loading" :disabled="!addr" />
        <UButton label="Try a wallet full of spam" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
    </form>
    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not load NFTs" @retry="load" />

    <template v-if="loadedFor && !loading">
      <p v-if="!rows.length" class="rounded-lg border border-dashed border-accented p-4 text-sm text-muted">
        No NFTs in this wallet on {{ network }}.
      </p>
      <p v-if="truncated" class="text-xs text-warning">
        Showing the first 1000 NFTs only.
      </p>

      <div v-if="rows.length" class="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="spam-summary">
        <div v-for="g in GROUPS" :key="g.cls" class="rounded-lg border border-default p-3">
          <div class="font-display text-xl font-semibold text-highlighted">
            {{ byClass[g.cls].length }}
          </div>
          <div class="text-xs text-muted">
            {{ g.title }}
          </div>
        </div>
      </div>

      <template v-for="g in GROUPS" :key="g.cls">
        <section v-if="byClass[g.cls].length" class="space-y-2">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="font-display text-sm font-semibold text-highlighted">
              {{ g.title }} ({{ byClass[g.cls].length }})
            </h3>
            <UButton
              v-if="g.cls === 'unverified' || g.cls === 'trusted'"
              :label="(g.cls === 'unverified' ? showUnverified : showTrusted) ? 'Hide' : 'Show'"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="g.cls === 'unverified' ? (showUnverified = !showUnverified) : (showTrusted = !showTrusted)"
            />
          </div>
          <p class="text-xs text-muted">
            {{ g.hint }}
          </p>
          <ul v-if="(g.cls !== 'unverified' || showUnverified) && (g.cls !== 'trusted' || showTrusted)" class="divide-y divide-default rounded-lg border border-default" :data-testid="`group-${g.cls}`">
            <li v-for="r in byClass[g.cls]" :key="r.nft.address" class="flex items-start gap-3 px-3 py-2">
              <UCheckbox
                class="mt-0.5"
                :model-value="selected.has(r.nft.address)"
                :disabled="g.cls === 'trusted'"
                :aria-label="`Select ${r.nft.metadata.name ?? 'NFT'}`"
                @update:model-value="toggle(r.nft.address, !!$event)"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm text-highlighted">
                  {{ r.nft.metadata.name || 'Unnamed NFT' }}
                </div>
                <div class="truncate text-xs text-muted">
                  {{ r.nft.collection?.name || 'No collection' }} · <span class="font-mono">{{ Address.parse(r.nft.address).toString({ testOnly: isTestnet }).slice(0, 8) }}…</span>
                </div>
                <p v-if="r.verdict && !r.verdict.ok" class="mt-1 text-xs text-muted">
                  {{ r.verdict.detail }}
                </p>
              </div>
              <UBadge v-if="r.verdict" :color="VERDICT[verdictKey(r.verdict)]!.color" variant="subtle" size="sm" :label="VERDICT[verdictKey(r.verdict)]!.label" />
            </li>
          </ul>
        </section>
      </template>

      <section v-if="chosen.length" class="space-y-4 border-t border-default pt-5">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Step 1 · Test {{ chosen.length }} selected NFT{{ chosen.length === 1 ? '' : 's' }}
        </h3>
        <p class="text-sm text-muted">
          Your browser downloads each NFT's contract and runs “transfer to the burn address” in a local TON emulator, with the real code and data.
          Only NFTs that really change owner, without passing your {{ COIN_SYMBOL }} on to someone else, can be burned. Nothing is sent.
        </p>
        <UButton v-if="unchecked.length" :label="`Test ${unchecked.length} NFT${unchecked.length === 1 ? '' : 's'}`" icon="i-lucide-flask-conical" :loading="checking" @click="check" />
        <LoadingState v-if="checking" :label="checkStage" />
        <ErrorNotice :error="checkError" title="Could not test" @retry="check" />
        <UAlert
          v-if="traps.length"
          color="error"
          variant="subtle"
          icon="i-lucide-ban"
          :title="`${traps.length} of the selected cannot be burned`"
          :description="`Their contracts refuse transfers or quietly keep the ${COIN_SYMBOL} you attach. Hide them in your wallet instead; they are excluded below.`"
        />
      </section>

      <section v-if="burnable.length" class="space-y-4" data-testid="burn-section">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Step 2 · Burn {{ burnable.length }} NFT{{ burnable.length === 1 ? '' : 's' }}
        </h3>
        <p class="text-sm text-muted">
          Each is transferred to the zero address <span class="font-mono break-all">{{ BURN_ADDRESS.toString({ bounceable: false, testOnly: isTestnet }) }}</span>, which nobody controls.
          {{ formatCoin(TRANSFER_AMOUNT) }} is attached per NFT and the unused part comes back (an NFT holding less than that keeps the difference as its storage reserve); emulated cost about <TokenAmount :nano="estCost" :max-decimals="4" /> in total plus wallet fees.
          <template v-if="batches.length > 1">
            Your wallet takes {{ maxMsgs }} messages at a time, so this needs {{ batches.length }} transactions.
          </template>
        </p>
        <p class="text-xs text-muted">
          This transaction burns: <span class="text-highlighted">{{ current.map(r => r.nft.metadata.name || 'Unnamed NFT').join(', ') }}</span>
        </p>
        <TxPreview :messages="messages" />
        <WalletGate purpose="burn spam NFTs">
          <p v-if="!isOwner" class="mb-3 text-sm text-warning">
            The connected wallet does not own these NFTs.
          </p>
          <UCheckbox v-model="confirm" label="I understand burned NFTs are gone for good." class="mb-3" />
          <UButton
            :label="batches.length > 1 ? `Burn ${current.length} in wallet (1 of ${batches.length})` : 'Burn in wallet'"
            icon="i-lucide-flame"
            color="error"
            :disabled="!isOwner || !confirm"
            :loading="sender.sending.value"
            @click="burn"
          />
        </WalletGate>
        <p v-if="sender.stage.value" class="text-sm text-muted">
          {{ sender.stage.value }}
        </p>
      </section>
      <ErrorNotice :error="sender.error.value" title="Not burned" />
      <SentNotice v-if="sender.last.value" :outcome="sender.last.value" success="Burned" />
    </template>
  </div>
</template>
