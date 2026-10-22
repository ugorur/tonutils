<script setup lang="ts">
import { Address } from '@ton/core'

// Short address + copy + explorer links. Client-only (imports @ton/core): use inside Tool.vue.
const props = withDefaults(defineProps<{
  /** Raw (0:…) or user-friendly address. Raw is shown bounceable unless `bounceable` is false. */
  address: string
  bounceable?: boolean
  /** Show the full address instead of 6…6. */
  full?: boolean
  /** Hide the explorer links. */
  noLinks?: boolean
}>(), { bounceable: true })

const { isTestnet } = useTonNetwork()
const friendly = computed(() => {
  const a = props.address.trim()
  if (!a.includes(':')) return a
  try {
    return Address.parse(a).toString({ bounceable: props.bounceable, testOnly: isTestnet.value, urlSafe: true })
  }
  catch {
    return a
  }
})
const shown = computed(() => (props.full || friendly.value.length < 16 ? friendly.value : `${friendly.value.slice(0, 6)}…${friendly.value.slice(-6)}`))
</script>

<template>
  <span class="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
    <span class="font-mono text-sm break-all text-highlighted" :title="friendly">{{ shown }}</span>
    <CopyButton :value="friendly" size="xs" class="-my-1" />
    <ExplorerLinks v-if="!noLinks" :value="friendly" />
  </span>
</template>
