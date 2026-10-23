<script setup lang="ts">
import { Address } from '@ton/core'

// Whose assets the tool works on: the connected wallet, or (before connecting) any address in read-only
// preview mode, so people can see exactly what would be sent. Client-only (imports @ton/core).
const owner = defineModel<Address | null>('owner', { default: null })
const emit = defineEmits<{ example: [] }>()
const props = defineProps<{
  /** Mainnet address loaded by "Try an example". */
  example: string
  exampleLabel: string
}>()

const tc = useTonConnect()
const { isTestnet } = useTonNetwork()
const input = ref('')
const typed = shallowRef<Address | null>(null)
const connected = computed(() => (tc.wallet.value && !tc.networkMismatch.value ? Address.parse(tc.wallet.value.address) : null))

watch([connected, typed], ([c, t]) => {
  const next = c ?? t
  if (next && owner.value && next.equals(owner.value)) return
  owner.value = next
}, { immediate: true })

function example() {
  input.value = props.example
  emit('example')
}
</script>

<template>
  <div v-if="connected" class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-elevated/60 px-3 py-2 text-sm">
    <UIcon name="i-lucide-wallet" class="size-4 text-primary" />
    <span class="text-muted">Your wallet</span>
    <AddressLink :address="connected.toString({ bounceable: false, testOnly: isTestnet })" :bounceable="false" />
  </div>
  <div v-else class="space-y-2 rounded-lg border border-dashed border-accented p-3">
    <p class="text-sm text-muted">
      <span class="font-medium text-default">Preview mode.</span> Connect your wallet to send, or paste any address to see its assets and the exact transaction this tool would build (read-only).
    </p>
    <AddressInput v-model="input" label="Preview with an address" placeholder="EQ… / UQ…" @parsed="typed = $event" />
    <UButton :label="exampleLabel" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" data-testid="try-example" @click="example" />
  </div>
</template>
