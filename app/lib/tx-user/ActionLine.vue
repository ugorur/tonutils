<script setup lang="ts">
import type { ActionKind, ActionView } from './events'

// One described action: icon, plain-language title, counterparty, comment and signed amounts.
// Client-only (AddressLink imports @ton/core): use inside a Tool.vue.
const props = withDefaults(defineProps<{
  view: ActionView
  /** Show explorer links next to the counterparty. */
  links?: boolean
  /** Viewer-relative wording: "to"/"from" the counterparty. Off = show both sides. */
  relative?: boolean
}>(), { links: false, relative: true })

const ICONS: Record<ActionKind, string> = {
  send: 'i-lucide-arrow-up-right',
  receive: 'i-lucide-arrow-down-left',
  swap: 'i-lucide-repeat',
  nft: 'i-lucide-image',
  stake: 'i-lucide-layers',
  contract: 'i-lucide-code',
  other: 'i-lucide-zap'
}

const icon = computed(() => (props.view.ok ? ICONS[props.view.kind] : 'i-lucide-circle-x'))
const tone = computed(() => {
  if (!props.view.ok) return 'bg-error/10 text-error'
  if (props.view.kind === 'receive') return 'bg-success/10 text-success'
  if (props.view.kind === 'swap') return 'bg-primary/10 text-primary'
  return 'bg-elevated text-muted'
})
const cpLabel = computed(() => {
  const v = props.view
  if (!v.counterparty) return ''
  if (v.kind === 'swap') return 'via'
  if (v.kind === 'receive' || (v.kind === 'nft' && v.title.startsWith('Received'))) return 'from'
  if (v.kind === 'stake') return 'pool'
  return 'to'
})
</script>

<template>
  <div class="flex min-w-0 items-start gap-3">
    <div class="grid size-9 shrink-0 place-items-center rounded-full" :class="tone">
      <UIcon :name="icon" class="size-4.5" />
    </div>
    <div class="min-w-0 flex-1 space-y-0.5">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="font-medium text-highlighted">{{ view.title }}</span>
        <UBadge v-if="!view.ok" color="error" variant="subtle" size="sm" label="Failed" />
        <UBadge v-if="view.spam" color="warning" variant="subtle" size="sm" icon="i-lucide-shield-alert" label="Likely spam" />
      </div>

      <div v-if="relative && view.counterparty" class="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted">
        <span>{{ cpLabel }}</span>
        <span v-if="view.counterparty.name" class="font-medium text-default">{{ view.counterparty.name }}</span>
        <AddressLink :address="view.counterparty.address" :bounceable="!view.counterparty.is_wallet" :no-links="!links" />
      </div>
      <div v-else-if="!relative && (view.from || view.to)" class="space-y-0.5 text-sm text-muted">
        <div v-if="view.from" class="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span class="w-9 shrink-0">from</span>
          <span v-if="view.from.name" class="font-medium text-default">{{ view.from.name }}</span>
          <AddressLink :address="view.from.address" :bounceable="!view.from.is_wallet" :no-links="!links" />
        </div>
        <div v-if="view.to?.address" class="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <span class="w-9 shrink-0">to</span>
          <span v-if="view.to.name" class="font-medium text-default">{{ view.to.name }}</span>
          <AddressLink :address="view.to.address" :bounceable="!view.to.is_wallet" :no-links="!links" />
        </div>
      </div>

      <p v-if="view.comment" class="text-sm break-words text-default">
        <UIcon name="i-lucide-message-square" class="mr-1 inline size-3.5 align-[-2px] text-muted" />{{ view.comment }}
      </p>
      <p v-else-if="view.encrypted" class="text-sm text-muted">
        <UIcon name="i-lucide-lock" class="mr-1 inline size-3.5 align-[-2px]" />Encrypted comment
      </p>
    </div>
    <div v-if="view.flows.length" class="shrink-0 space-y-0.5 text-right text-sm">
      <div v-for="(f, i) in view.flows" :key="i" :class="!relative || f.amount < 0n ? 'text-default' : 'text-success'">
        {{ !relative ? '' : f.amount < 0n ? '−' : '+' }}<TokenAmount :nano="f.amount < 0n ? -f.amount : f.amount" :decimals="f.asset.decimals" :symbol="f.asset.symbol" :max-decimals="4" />
      </div>
    </div>
  </div>
</template>
