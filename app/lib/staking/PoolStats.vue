<script setup lang="ts">
import type { StakingPool } from './pools'
import { apyIsEstimate, compactCoins, cycleLabel, isFull, nextCycleEnd, relativeTime } from './pools'

// Key numbers of one pool as a compact grid. No @ton imports: safe anywhere.
const props = defineProps<{ pool: StakingPool, now: number }>()

const stats = computed(() => {
  const p = props.pool
  return [
    { label: 'APY', value: `${p.apy.toFixed(2)}%`, hint: apyIsEstimate(p) ? 'Network-wide estimate from tonapi; the real yield depends on this validator\'s reward share.' : 'Reported by tonapi.io from recent rounds.', estimate: apyIsEstimate(p) },
    { label: 'Min stake', value: `${formatAmount(BigInt(p.min_stake), 9, { maxDecimals: 2 })} ${COIN_SYMBOL}`, hint: p.implementation === 'tf' ? `Includes the 1 ${COIN_SYMBOL} deposit fee.` : undefined },
    { label: 'Staked (TVL)', value: `${compactCoins(p.total_amount)} ${COIN_SYMBOL}` },
    { label: 'Nominators', value: p.max_nominators < 0 ? p.current_nominators.toLocaleString('en-US') : `${p.current_nominators.toLocaleString('en-US')} / ${p.max_nominators.toLocaleString('en-US')}`, warn: isFull(p) },
    { label: 'Next payout', value: relativeTime(nextCycleEnd(p, props.now), props.now), hint: `Rewards are paid every ${cycleLabel(p.cycle_length)}.` }
  ]
})
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
    <div v-for="s in stats" :key="s.label" class="min-w-0">
      <dt class="text-xs text-muted">
        {{ s.label }}
      </dt>
      <dd class="mt-0.5 flex items-center gap-1 text-sm font-medium tabular-nums" :class="s.warn ? 'text-warning' : 'text-highlighted'" :title="s.hint">
        <span class="truncate">{{ s.value }}</span>
        <UIcon v-if="s.estimate" name="i-lucide-info" class="size-3.5 shrink-0 text-muted" />
        <span v-if="s.warn" class="text-xs font-normal">full</span>
      </dd>
    </div>
  </dl>
</template>
