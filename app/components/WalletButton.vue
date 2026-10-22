<script setup lang="ts">
import { explorerUrl } from '~/utils/ton/explorers'

// Header wallet button. Loads @tonconnect/ui on first click, or right away when a previous session exists.
const tc = useTonConnect()
const opening = ref(false)

onMounted(() => {
  try {
    if (Object.keys(localStorage).some(k => k.startsWith('ton-connect'))) tc.getUi()
  }
  catch { /* storage blocked: connect on click */ }
})

async function connect() {
  opening.value = true
  try {
    await tc.connect()
  }
  catch (e) {
    useToast().add({ title: 'Could not open the wallet list', description: (e as Error).message, color: 'error' })
  }
  finally {
    opening.value = false
  }
}

const short = computed(() => {
  const a = tc.wallet.value?.friendly ?? ''
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : ''
})

const items = computed(() => {
  const w = tc.wallet.value
  if (!w) return []
  return [
    [{ type: 'label' as const, label: `${w.walletName} · ${w.network ?? `chain ${w.chain}`}` }],
    [
      { label: 'Copy address', icon: 'i-lucide-copy', onSelect: () => navigator.clipboard.writeText(w.friendly) },
      { label: 'View in explorer', icon: 'i-lucide-external-link', to: explorerUrl('tonviewer', 'address', w.friendly, w.network ?? 'mainnet') ?? undefined, target: '_blank' }
    ],
    [{ label: 'Disconnect', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: () => tc.disconnect() }]
  ]
})
</script>

<template>
  <UDropdownMenu v-if="tc.wallet.value" :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="outline"
      size="sm"
      :icon="tc.networkMismatch.value ? 'i-lucide-triangle-alert' : 'i-lucide-wallet'"
      :class="tc.networkMismatch.value && 'text-warning'"
      :label="short"
      :ui="{ label: 'font-mono' }"
      :aria-label="`Wallet ${tc.wallet.value.friendly}`"
    />
  </UDropdownMenu>
  <UButton
    v-else
    size="sm"
    icon="i-lucide-wallet"
    :loading="opening"
    data-testid="wallet-connect"
    @click="connect"
  >
    <span class="hidden sm:inline">Connect wallet</span>
    <span class="sm:hidden">Connect</span>
  </UButton>
</template>
