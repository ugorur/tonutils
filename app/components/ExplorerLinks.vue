<script setup lang="ts">
import type { ExplorerKind } from '~/utils/ton/explorers'
import { explorerLinks } from '~/utils/ton/explorers'

// Small row of "open in explorer" links. Uses the site network unless one is given.
const props = withDefaults(defineProps<{
  value: string
  kind?: ExplorerKind
  network?: 'mainnet' | 'testnet'
}>(), { kind: 'address' })

const site = useTonNetwork().network
const links = computed(() => explorerLinks(props.kind, props.value, props.network ?? site.value))
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
    <a
      v-for="l in links"
      :key="l.id"
      :href="l.url"
      target="_blank"
      rel="noopener"
      class="inline-flex items-center gap-1 text-muted hover:text-primary"
    >{{ l.name }}<UIcon name="i-lucide-arrow-up-right" class="size-3" /></a>
  </span>
</template>
