<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { parseExplorerInput, switchLinks, type Network } from './logic'

const EXAMPLES = [
  { label: 'Transaction on Tonscan', value: 'https://tonscan.org/tx/43497e195028a9418a1e2000cb5a6d73538d0f2e8406210faf0679a2f3642db0' },
  { label: 'Wallet on Tonviewer', value: 'https://tonviewer.com/UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI' },
  { label: 'USD₮ jetton', value: 'https://tonscan.org/jetton/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' }
]
// TonUtils tools that read ?q=<address> on load (they use the site network from the header).
const INTERNAL = [
  { slug: 'account-overview', label: 'Account overview', icon: 'i-lucide-wallet' },
  { slug: 'tx-history', label: 'Transaction history', icon: 'i-lucide-history' },
  { slug: 'contract-inspector', label: 'Contract inspector', icon: 'i-lucide-scan-search' }
]
const KIND_LABEL = { address: 'Account', tx: 'Transaction', nft: 'NFT item', collection: 'NFT collection', jetton: 'Jetton' }

const input = ref('')
const site = useTonNetwork().network
const network = ref<Network>(site.value)
const bounceable = ref(true)

const result = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: parseExplorerInput(input.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const data = computed(() => result.value?.ok ? result.value.data : null)

// Follow what the link says; fall back to the site network. The user can still switch.
watch(data, (d) => {
  if (!d) return
  network.value = d.network ?? site.value
  bounceable.value = d.address?.bounceableFlag ?? true
})

const links = computed(() => data.value ? switchLinks(data.value, network.value, bounceable.value) : [])

const detected = computed(() => {
  const d = data.value
  if (!d) return ''
  const from = d.source === 'plain' ? 'pasted value' : `${d.source} link`
  return `${KIND_LABEL[d.kind]} · ${from} · ${d.network ?? 'network not stated'}`
})

const rows = computed<KeyValueItem[]>(() => {
  const d = data.value
  if (!d) return []
  if (d.tx) {
    return [
      { label: 'Hash (hex)', value: d.tx.hex, hint: 'Tonviewer, Tonscan and tonscan.com use this form.' },
      { label: 'Hash (base64)', value: d.tx.base64, hint: 'toncenter and older tools use base64.' },
      { label: 'Hash (base64url)', value: d.tx.base64url }
    ]
  }
  const a = d.address!
  return [
    { label: 'Bounceable', value: a.bounceable },
    { label: 'Non-bounceable', value: a.nonBounceable },
    { label: 'Raw', value: a.raw }
  ]
})
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="Explorer link, address or transaction hash">
        <UInput
          v-model="input"
          placeholder="https://tonviewer.com/… or EQ… or a tx hash"
          class="w-full"
          size="lg"
          :ui="{ base: 'font-mono text-sm' }"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div v-if="!input" class="flex flex-wrap gap-x-4">
        <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = e.value" />
      </div>
    </div>

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="data">
      <ResultField label="Detected" :value="detected" :mono="false" :copy="false" />

      <div class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Open on
          </h3>
          <div class="flex flex-wrap items-center gap-3">
            <USwitch v-if="data.address" v-model="bounceable" label="Bounceable form" size="sm" />
            <UTabs
              v-model="network"
              :content="false"
              :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]"
              size="xs"
            />
          </div>
        </div>
        <UAlert
          v-if="data.network && data.network !== network"
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          :title="`The link was for ${data.network}. Showing ${network} links.`"
        />
        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="l in links" :key="l.id" class="flex min-w-0 items-center gap-2 rounded-lg border border-default p-3">
            <a :href="l.url" target="_blank" rel="noopener" class="min-w-0 flex-1 hover:text-primary">
              <div class="flex items-center gap-1 text-sm font-semibold text-highlighted">{{ l.name }}<UIcon name="i-lucide-arrow-up-right" class="size-3.5" /></div>
              <div class="truncate font-mono text-xs text-muted">{{ l.url.replace(/^https:\/\//, '') }}</div>
            </a>
            <CopyButton :value="l.url" size="xs" />
          </div>
        </div>
        <p v-if="!links.length" class="text-sm text-muted">
          No explorer has a {{ network }} page for this.
        </p>
      </div>

      <div v-if="data.address" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Open in TonUtils
        </h3>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="t in INTERNAL"
            :key="t.slug"
            :to="{ path: `/tools/${t.slug}`, query: { q: data.address.bounceable } }"
            :label="t.label"
            :icon="t.icon"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </div>
      </div>

      <KeyValue :items="rows" />
    </template>

    <p class="text-xs text-dimmed">
      Links are rebuilt locally from the address or hash; nothing is looked up. dton.io, Tonwhales and explorer.toncoin.org links are read but not offered as targets: their account and transaction pages no longer open reliably.
    </p>
  </div>
</template>
