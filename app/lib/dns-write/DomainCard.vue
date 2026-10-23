<script setup lang="ts">
// Summary of a .ton domain's on-chain state. Client-only (AddressLink imports @ton/core).
import type { DomainLookup, DomainStatus } from './dns'
import { fmtDate, relativeTime } from './dns'

const props = defineProps<{ lookup: DomainLookup, status: DomainStatus, now: number }>()

const BADGE: Record<DomainStatus['kind'], { label: string, color: 'success' | 'warning' | 'error' | 'info' | 'neutral', icon: string }> = {
  free: { label: 'Available', color: 'success', icon: 'i-lucide-circle-check' },
  auction: { label: 'Auction running', color: 'info', icon: 'i-lucide-gavel' },
  won: { label: 'Auction ended', color: 'neutral', icon: 'i-lucide-flag' },
  owned: { label: 'Registered', color: 'neutral', icon: 'i-lucide-lock' },
  expired: { label: 'Expired', color: 'error', icon: 'i-lucide-clock-alert' }
}
const badge = computed(() => BADGE[props.status.kind])
const full = computed(() => `${props.lookup.name || props.lookup.item?.domain}.ton`)
const owner = computed(() => {
  const s = props.status
  const a = s.kind === 'won' ? s.winner : s.kind === 'owned' || s.kind === 'expired' ? s.owner : null
  return a?.toRawString() ?? null
})
</script>

<template>
  <div class="space-y-3 rounded-lg border border-default p-4" data-testid="dns-domain-card">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="font-display text-lg font-semibold break-all text-highlighted">{{ full }}</span>
      <UBadge :color="badge.color" variant="subtle" :icon="badge.icon" :label="badge.label" />
    </div>

    <dl class="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
      <dt class="text-muted">
        Domain contract
      </dt>
      <dd class="min-w-0">
        <AddressLink v-if="lookup.item" :address="lookup.address.toRawString()" />
        <span v-else class="text-muted">Not deployed yet (deployed when the first auction starts)</span>
      </dd>

      <template v-if="owner">
        <dt class="text-muted">
          {{ status.kind === 'won' ? 'Winner' : 'Owner' }}
        </dt>
        <dd class="min-w-0">
          <AddressLink :address="owner" :bounceable="false" />
        </dd>
      </template>

      <template v-if="status.kind === 'auction'">
        <dt class="text-muted">
          Top bid
        </dt>
        <dd>
          <TokenAmount :nano="status.auction.maxBid" :max-decimals="4" />
          <span v-if="status.auction.maxBidder" class="mx-1 text-muted">by</span>
          <AddressLink v-if="status.auction.maxBidder" :address="status.auction.maxBidder.toRawString()" :bounceable="false" no-links class="inline-flex" />
        </dd>
        <dt class="text-muted">
          Ends
        </dt>
        <dd>{{ fmtDate(status.auction.endTime) }} <span class="text-muted">({{ relativeTime(status.auction.endTime, now) }})</span></dd>
      </template>

      <template v-if="status.kind === 'owned' || status.kind === 'won' || status.kind === 'expired'">
        <dt class="text-muted">
          {{ status.kind === 'expired' ? 'Expired' : 'Expires' }}
        </dt>
        <dd :class="status.kind === 'expired' ? 'text-error' : ''">
          {{ fmtDate(status.expiresAt) }} <span class="text-muted">({{ relativeTime(status.expiresAt, now) }})</span>
        </dd>
      </template>
    </dl>
  </div>
</template>
