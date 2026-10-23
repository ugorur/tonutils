<script setup lang="ts">
import { KNOWN_JETTONS } from '~/utils/ton/jetton'

// Jetton master field + one-click popular tokens (mainnet only). Client-only (AddressInput imports @ton/core).
const model = defineModel<string>({ default: '' })
withDefaults(defineProps<{ label?: string }>(), { label: 'Token (jetton master address)' })
const emit = defineEmits<{ pick: [master: string] }>()
const { isTestnet } = useTonNetwork()

function pick(master: string) {
  model.value = master
  emit('pick', master)
}
</script>

<template>
  <div class="space-y-1.5">
    <AddressInput v-model="model" :label="label" placeholder="EQ… address of the token contract" />
    <div v-if="!isTestnet" class="flex flex-wrap items-center gap-1.5 text-xs">
      <span class="text-muted">Popular:</span>
      <UButton
        v-for="j in KNOWN_JETTONS"
        :key="j.master"
        :label="j.symbol"
        size="xs"
        color="neutral"
        :variant="model === j.master ? 'solid' : 'outline'"
        @click="pick(j.master)"
      />
    </div>
  </div>
</template>
