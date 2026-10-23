<script setup lang="ts">
// Exact amount display. Default unit: GRAM with 9 decimals.
const props = withDefaults(defineProps<{
  /** Base units (nanoGRAM for GRAM). */
  nano: bigint | string | number
  decimals?: number
  symbol?: string
  /** Truncate shown decimals (full value stays in the tooltip/title). */
  maxDecimals?: number
}>(), { decimals: COIN_DECIMALS, symbol: COIN_SYMBOL })

const units = computed(() => {
  try {
    return BigInt(props.nano)
  }
  catch {
    return null
  }
})
const full = computed(() => (units.value === null ? '—' : formatAmount(units.value, props.decimals)))
const shown = computed(() => (units.value === null ? '—' : formatAmount(units.value, props.decimals, { maxDecimals: props.maxDecimals })))
</script>

<template>
  <!-- The number never breaks; the symbol may wrap to the next line in narrow containers. -->
  <span class="font-mono tabular-nums" :title="`${full} ${symbol}`"><span class="whitespace-nowrap">{{ shown }}</span><span v-if="symbol" class="font-sans text-muted">{{ ` ${symbol}` }}</span></span>
</template>
