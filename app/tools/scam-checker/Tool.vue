<script setup lang="ts">
import { Address } from '@ton/core'
import type { TonapiJetton } from '~/lib/jettons-read/core'
import type { TonapiNft } from '~/lib/nfts-write/chain'
import RiskList from '~/lib/security/RiskList.vue'
import { type Check, fetchEvents, type Label, loadLabels, senderProfile, sortChecks } from '~/lib/security/core'
import { parseRecipient, type TonapiAccount } from '~/lib/wallet-actions/core'
import { EXAMPLES, type Kind, KIND_LABEL, kindOf, scamChecks, type TonapiCollection, verdictOf } from './logic'

const tonapi = useTonapi()
const { network, isTestnet } = useTonNetwork()

const text = ref('')
const parsed = computed(() => parseRecipient(text.value))

interface Result { kind: Kind, address: string, name?: string, token?: string, checks: Check[] }
const result = shallowRef<Result | null>(null)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)
let session = 0

const notFound = (e: { status?: number }) => {
  if (e.status === 404) return null
  throw e
}

async function check() {
  const p = parsed.value
  if (p.kind !== 'address' && p.kind !== 'domain') return
  const my = ++session
  loading.value = true
  error.value = null
  result.value = null
  try {
    let address: Address
    if (p.kind === 'domain') {
      stage.value = `Resolving ${p.domain}…`
      const r = await tonapi.get<{ wallet?: { address?: string } }>(`dns/${encodeURIComponent(p.domain)}/resolve`).catch(notFound)
      if (!r?.wallet?.address) throw new Error(`${p.domain} does not point to a wallet.`)
      address = Address.parse(r.wallet.address)
    }
    else address = p.address
    const raw = address.toRawString().toLowerCase()
    // ton-assets names are mainnet addresses: they mean nothing on testnet.
    const labelsP = isTestnet.value ? Promise.resolve(new Map<string, Label>()) : loadLabels()
    stage.value = 'Reading the account (tonapi)…'
    const account = await tonapi.get<TonapiAccount>(`accounts/${raw}`)
    const kind = kindOf(account)
    let jetton: TonapiJetton | null = null
    let nft: TonapiNft | null = null
    let collection: TonapiCollection | null = null
    if (kind === 'jetton') {
      stage.value = 'Reading the token…'
      jetton = await tonapi.get<TonapiJetton>(`jettons/${raw}`).catch(notFound)
    }
    else if (kind === 'jetton-wallet') {
      stage.value = 'Finding which token this balance belongs to…'
      const wd = await tonapi.get<{ decoded?: { jetton?: string } }>(`blockchain/accounts/${raw}/methods/get_wallet_data`).catch(notFound)
      if (wd?.decoded?.jetton) jetton = await tonapi.get<TonapiJetton>(`jettons/${wd.decoded.jetton}`).catch(notFound)
    }
    else if (kind === 'nft') {
      stage.value = 'Reading the NFT…'
      nft = await tonapi.get<TonapiNft>(`nfts/${raw}`).catch(notFound)
    }
    else if (kind === 'collection') {
      stage.value = 'Reading the collection…'
      collection = await tonapi.get<TonapiCollection>(`nfts/collections/${raw}`).catch(notFound)
    }
    let profile = null
    if (kind === 'wallet' || kind === 'contract') {
      stage.value = 'Checking what it sends…'
      profile = senderProfile((await fetchEvents(tonapi.get, raw, 25)).events, raw)
    }
    const label = (await labelsP).get(raw)
    if (my !== session) return
    const bounceable = !(kind === 'wallet' || kind === 'empty')
    result.value = {
      kind,
      address: address.toString({ bounceable, testOnly: isTestnet.value, urlSafe: true }),
      name: account.name ?? label?.name ?? nft?.metadata?.name ?? collection?.metadata?.name,
      token: jetton ? `${jetton.metadata.name ?? 'Unnamed'} (${jetton.metadata.symbol ?? '?'})` : undefined,
      checks: sortChecks(scamChecks({ account, label, jetton, nft, collection, profile }))
    }
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) loading.value = false
  }
}

function example(v: string) {
  text.value = v
  nextTick(check)
}
watch(network, () => {
  result.value = null
})

const verdict = computed(() => (result.value ? verdictOf(result.value.checks) : null))
const VERDICT = {
  scam: { color: 'error', icon: 'i-lucide-octagon-x', title: 'Scam signals found', text: 'Do not send funds, buy, “claim” or open links connected to this address.' },
  suspicious: { color: 'warning', icon: 'i-lucide-triangle-alert', title: 'Be careful', text: 'Not on a scam list, but something here deserves a closer look.' },
  clean: { color: 'success', icon: 'i-lucide-circle-check', title: 'No scam signals found', text: 'Nothing in public data flags it. That is not a guarantee: new scams appear every day.' }
} as const
const explorerKind = computed(() => ({ jetton: 'jetton', nft: 'nft', collection: 'collection' } as Record<string, 'jetton' | 'nft' | 'collection'>)[result.value?.kind ?? ''] ?? 'address')
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="check">
      <UFormField label="Address, token or NFT" :error="parsed.kind === 'invalid' ? parsed.error : undefined" help="Any TON address (UQ…, EQ…, 0:…) or a .ton / .t.me name">
        <UInput
          v-model="text"
          placeholder="Paste an address someone sent you"
          class="w-full"
          size="lg"
          :ui="{ base: 'font-mono text-sm' }"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton type="submit" label="Check" icon="i-lucide-shield-alert" :loading="loading" :disabled="parsed.kind !== 'address' && parsed.kind !== 'domain'" />
        <span class="text-xs text-muted">Try:</span>
        <UButton v-for="e in EXAMPLES" :key="e.value" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
      </div>
    </form>

    <LoadingState v-if="loading" :label="stage" />
    <ErrorNotice :error="error" title="Could not check this address" @retry="check" />

    <template v-if="result && verdict && !loading">
      <UAlert :color="VERDICT[verdict].color" variant="subtle" :icon="VERDICT[verdict].icon" :title="VERDICT[verdict].title" :description="VERDICT[verdict].text" data-testid="verdict" />

      <div class="rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="neutral" variant="outline" :label="KIND_LABEL[result.kind]" />
          <span v-if="result.name" class="text-sm text-highlighted">{{ result.name }}</span>
        </div>
        <div v-if="result.token" class="mt-1 text-sm text-muted">
          Token: <span class="text-highlighted">{{ result.token }}</span>
        </div>
        <div class="mt-2 flex items-start gap-1">
          <span class="font-mono text-sm break-all text-highlighted">{{ result.address }}</span>
          <CopyButton :value="result.address" size="xs" />
        </div>
        <ExplorerLinks :value="result.address" :kind="explorerKind" class="mt-1" />
      </div>

      <RiskList title="Checks" :checks="result.checks" />
    </template>

    <p class="text-xs text-muted">
      Sources: tonapi scam flags and verification lists (the ones Tonkeeper uses), Tonkeeper's public ton-assets names, and the address's own recent transfers. Nothing is sent or signed.
    </p>
  </div>
</template>
