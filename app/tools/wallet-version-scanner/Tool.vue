<script setup lang="ts">
import type { Address } from '@ton/core'
import type { JettonWalletsResponse, NftItemsResponse, ScanRow, TonapiPubkeyWallets, WalletStatesResponse } from './logic'
import { buildRows, classifyScanInput, deriveAll, hasActivity, scanAddresses } from './logic'
import { inspectAccount } from '~/lib/wallet-detection/state'

// A W5 wallet whose key also holds funds in v3R1, v3R2 and v4R2 (toncenter walletStates, 2026-10-22).
const EXAMPLE = 'UQDvgilV4Py6kIrnbXEeEtwxTMQxjt5mt0w9YoIbaynOKVVz'

const input = ref('')
const loading = ref('')
const error = ref<unknown>(null)
const publicKey = ref('')
const rows = ref<ScanRow[] | null>(null)
const showAll = ref(false)

const { network, isTestnet } = useTonNetwork()
const tc = useToncenter()
const ta = useTonapi()

async function keyForAddress(a: Address): Promise<string> {
  loading.value = 'Reading the public key from the wallet contract…'
  const acc = await tc.v3<{ code: string | null, data: string | null, status: string }>('account', { address: a.toRawString() })
  if (acc.code) {
    const r = inspectAccount(acc.code, acc.data, { workchain: a.workChain, testOnly: isTestnet.value })
    if (r.data?.publicKey) return r.data.publicKey
  }
  if (acc.status !== 'active') throw new Error('This address has no deployed wallet yet, so its public key is not on-chain. Paste the public key instead, or the address of a wallet from the same recovery phrase that has already sent a transaction.')
  // Unknown code: ask tonapi, which runs get_public_key.
  try {
    const r = await ta.get<{ public_key: string }>(`accounts/${a.toRawString()}/publickey`)
    return r.public_key
  }
  catch (e) {
    // 4xx: the contract has no get_public_key, so it is not a wallet. Rate limits and outages keep the retry box.
    if (e instanceof TonApiError && e.status >= 400 && e.status < 500 && !e.isRateLimit) {
      throw new Error('This address is a smart contract, not a wallet with a public key (e.g. a jetton, NFT or DEX contract). Enter a wallet address or a public key.')
    }
    throw e
  }
}

async function run() {
  error.value = null
  rows.value = null
  showAll.value = false
  try {
    const parsed = classifyScanInput(input.value)
    const inputAddress = parsed.kind === 'address' ? parsed.address : null
    publicKey.value = parsed.kind === 'publicKey' ? parsed.publicKey : await keyForAddress(parsed.address)

    loading.value = 'Checking every wallet version for balances, jettons and NFTs…'
    const derived = deriveAll(publicKey.value, network.value)
    // tonapi also knows wallets with non-default subwallet ids; it runs on its own queue, in parallel.
    const indexedP = ta.get<TonapiPubkeyWallets>(`pubkeys/${publicKey.value}/wallets`).catch(() => null)
    const states = await tc.v3<WalletStatesResponse>('walletStates', { address: derived.map(d => d.raw).join(',') })
    const indexed = await indexedP
    const all = scanAddresses(derived, indexed).join(',')
    const jettons = await tc.v3<JettonWalletsResponse>('jetton/wallets', { owner_address: all, exclude_zero_balance: true, limit: 1000 })
    const nfts = await tc.v3<NftItemsResponse>('nft/items', { owner_address: all, limit: 1000 })
    rows.value = buildRows({ derived, states, jettons, nfts, indexed, input: inputAddress, testOnly: isTestnet.value })
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = ''
  }
}

watch(network, () => {
  if (rows.value) run()
})

const found = computed(() => (rows.value ?? []).filter(hasActivity))
const shown = computed(() => (showAll.value ? rows.value ?? [] : found.value))
const total = computed(() => found.value.reduce((s, r) => s + r.balance, 0n))
const others = computed(() => found.value.filter(r => !r.isInput && (r.balance > 0n || r.jettonCount > 0 || (r.nfts ?? 0) > 0)))

const STATUS: Record<string, { label: string, color: 'success' | 'warning' | 'neutral' | 'error' }> = {
  active: { label: 'Active', color: 'success' },
  uninit: { label: 'Not deployed', color: 'warning' },
  frozen: { label: 'Frozen', color: 'error' },
  nonexist: { label: 'Never used', color: 'neutral' }
}
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Wallet address or public key" hint="Public key: 64 hex characters">
        <div class="flex flex-col gap-2 sm:flex-row">
          <UInput
            v-model="input"
            placeholder="UQ…, EQ… or 64-character public key"
            size="lg"
            class="w-full"
            :ui="{ base: 'font-mono text-sm' }"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <UButton type="submit" label="Scan" icon="i-lucide-search-check" size="lg" :loading="!!loading" :disabled="!input.trim()" class="justify-center" />
        </div>
      </UFormField>
      <UButton v-if="!input" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = EXAMPLE; run()" />
      <p class="text-xs text-muted">
        Never type your 24 words here. An address or public key is enough: both are public.
      </p>
    </form>

    <LoadingState v-if="loading" :label="loading" />
    <ErrorNotice :error="error" @retry="run" />

    <template v-if="rows && !loading">
      <ResultField label="Public key" :value="publicKey" />

      <UAlert
        v-if="others.length"
        color="primary"
        variant="subtle"
        icon="i-lucide-piggy-bank"
        :title="`Found ${formatCoin(total)} across ${found.length} wallet versions`"
        :description="`The same key controls ${others.length === 1 ? 'another wallet' : 'other wallets'} with funds or tokens. To use them, open your wallet app's wallet-version setting (or import the same recovery phrase in an app that lets you choose the version), switch to it and send the funds to your main wallet.`"
      />
      <UAlert
        v-else-if="found.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-circle-check"
        title="No funds in other versions"
        description="Only the wallet shown below holds anything. Nothing is stuck in another version of this key."
      />
      <UAlert v-else color="neutral" variant="subtle" icon="i-lucide-circle-dashed" title="No activity on any standard version" description="None of the standard wallet addresses for this key has been used yet." />

      <div class="space-y-3">
        <div v-for="r in shown" :key="r.raw" class="rounded-md border p-3 sm:p-4" :class="r.isInput ? 'border-primary' : 'border-default'">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-display text-sm font-semibold text-highlighted">{{ r.label }}</span>
              <UBadge :color="STATUS[r.status]?.color ?? 'neutral'" variant="subtle" size="sm" :label="STATUS[r.status]?.label ?? r.status" />
              <UBadge v-if="r.isInput" color="primary" variant="outline" size="sm" label="You entered this" />
            </div>
            <TokenAmount :nano="r.balance" class="text-highlighted" />
          </div>
          <AddressLink :address="r.address" :bounceable="false" class="mt-1" />
          <div v-if="r.jettonCount || r.nfts" class="mt-2 text-sm text-muted">
            <span v-if="r.jettonCount">{{ r.jettonCount }} jetton{{ r.jettonCount === 1 ? '' : 's' }}</span>
            <span v-if="r.jettonCount && r.nfts"> · </span>
            <span v-if="r.nfts">{{ r.nfts }} NFT{{ r.nfts === 1 ? '' : 's' }}</span>
            <details v-if="r.jettons.length" class="mt-1">
              <summary class="cursor-pointer text-xs">
                Show jettons
              </summary>
              <ul class="mt-1 space-y-0.5">
                <li v-for="j in r.jettons" :key="j.master" class="flex justify-between gap-3 text-xs">
                  <span class="min-w-0 truncate">{{ j.symbol }}</span>
                  <TokenAmount :nano="j.amount" :decimals="j.decimals" symbol="" :max-decimals="4" />
                </li>
              </ul>
              <p class="mt-1 text-xs text-dimmed">
                Unknown tokens are often spam. Never open links found in token names.
              </p>
            </details>
          </div>
        </div>
      </div>

      <UButton
        v-if="rows.length > found.length"
        :label="showAll ? 'Hide unused versions' : `Show all ${rows.length} checked versions`"
        :icon="showAll ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="showAll = !showAll"
      />
      <p class="text-xs text-muted">
        Checked: wallet v1R1 to W5 with the default subwallet on {{ network }}, plus any other wallets the tonapi indexer links to this key. Wallets with a custom subwallet id that never sent a transaction cannot be found.
      </p>
    </template>
  </div>
</template>
