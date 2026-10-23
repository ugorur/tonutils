<script setup lang="ts">
import { mainnetFriendly } from './fragment'

// Like <AddressLink>, but always mainnet: Telegram collectibles exist only there, whatever the header switch says.
const props = withDefaults(defineProps<{ address: string, bounceable?: boolean, full?: boolean, noLinks?: boolean }>(), { bounceable: false })

const friendly = computed(() => {
  try {
    return mainnetFriendly(props.address, props.bounceable)
  }
  catch {
    return props.address
  }
})
const shown = computed(() => (props.full ? friendly.value : `${friendly.value.slice(0, 6)}…${friendly.value.slice(-6)}`))
</script>

<template>
  <span class="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
    <span class="font-mono text-sm break-all text-highlighted" :title="friendly">{{ shown }}</span>
    <CopyButton :value="friendly" size="xs" class="-my-1" />
    <ExplorerLinks v-if="!noLinks" :value="friendly" network="mainnet" />
  </span>
</template>
