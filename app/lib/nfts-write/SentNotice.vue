<script setup lang="ts">
import type { SendOutcome } from './useSend'

// Result box after a TonConnect send: pending / confirmed / some messages failed, with explorer links.
defineProps<{ outcome: SendOutcome, success?: string }>()
</script>

<template>
  <UAlert
    v-if="outcome.trace && outcome.failed.length"
    color="warning"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    title="Confirmed, but part of it failed"
    :description="`${outcome.failed.length} contract call${outcome.failed.length === 1 ? '' : 's'} failed (exit code ${outcome.failed.map(f => f.exitCode ?? '?').join(', ')}). The attached ${COIN_SYMBOL} bounced back minus fees. Open the transaction for details.`"
  >
    <template #actions>
      <ExplorerLinks kind="tx" :value="outcome.trace.external_hash" />
    </template>
  </UAlert>
  <UAlert
    v-else-if="outcome.trace"
    color="success"
    variant="subtle"
    icon="i-lucide-circle-check"
    :title="success ?? 'Confirmed on chain'"
  >
    <template #actions>
      <ExplorerLinks kind="tx" :value="outcome.trace.external_hash" />
    </template>
  </UAlert>
  <UAlert
    v-else
    color="info"
    variant="subtle"
    icon="i-lucide-clock"
    title="Sent, not confirmed yet"
    description="The wallet signed and broadcast it, but the indexer has not shown the result yet. Check the explorer in a minute."
  >
    <template #actions>
      <ExplorerLinks kind="tx" :value="outcome.hash" />
    </template>
  </UAlert>
</template>
