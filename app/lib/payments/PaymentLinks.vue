<script setup lang="ts">
import type { PaymentRequest, ShareExtras } from './link'
import { buildLink, hostedUrl, LINK_LABEL, supportedKinds } from './link'

// Every link form of a payment request, each with copy and open.
const props = withDefaults(defineProps<{
  request: PaymentRequest
  extras?: ShareExtras
  /** Include the TonUtils checkout page link. */
  hosted?: boolean
}>(), { extras: () => ({}), hosted: true })

const rows = computed(() => [
  ...supportedKinds(props.request).map(k => ({ id: k, label: LINK_LABEL[k], url: buildLink(props.request, k) })),
  ...(props.hosted ? [{ id: 'hosted', label: 'TonUtils checkout page (wallet button + QR + payment check)', url: hostedUrl(props.request, props.extras, window.location.origin) }] : [])
])
</script>

<template>
  <ul class="divide-y divide-default rounded-lg border border-default" data-testid="payment-links">
    <li v-for="r in rows" :key="r.id" class="flex items-start gap-2 p-3">
      <div class="min-w-0 flex-1">
        <div class="text-xs text-muted">
          {{ r.label }}
        </div>
        <div class="mt-0.5 font-mono text-xs break-all text-highlighted" :data-testid="`link-${r.id}`">
          {{ r.url }}
        </div>
      </div>
      <CopyButton :value="r.url" class="shrink-0" />
      <UButton :to="r.url" target="_blank" external icon="i-lucide-external-link" size="sm" variant="ghost" color="neutral" :aria-label="`Open ${r.label}`" class="shrink-0" />
    </li>
  </ul>
</template>
