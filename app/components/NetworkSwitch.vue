<script setup lang="ts">
const { network, isTestnet, toggle } = useTonNetwork()
</script>

<template>
  <UTooltip :text="isTestnet ? 'Switch to mainnet' : 'Switch to testnet'">
    <UButton
      color="neutral"
      variant="outline"
      size="sm"
      class="rounded-full"
      :aria-label="`Network: ${network}. Click to switch.`"
      @click="toggle"
    >
      <span class="size-2 rounded-full" :class="isTestnet ? 'bg-signal-500' : 'bg-emerald-500'" />
      <span class="capitalize">{{ network }}</span>
    </UButton>
  </UTooltip>
</template>
