<script setup lang="ts">
import type { Decoded } from './logic'

defineProps<{ item: Decoded, label: string }>()
</script>

<template>
  <div class="min-w-0 rounded-md border border-default p-3">
    <div class="mb-1 flex items-center gap-2 text-xs text-muted">
      <span class="font-mono">{{ label }}</span>
      <UBadge size="sm" color="neutral" variant="soft" :label="item.kind === 'cell' || item.kind === 'tuple' || item.kind === 'unknown' ? item.type : item.kind" />
    </div>

    <template v-if="item.kind === 'num'">
      <div class="flex min-w-0 items-center gap-1">
        <span class="font-mono text-sm break-all text-highlighted">{{ item.dec }}</span>
        <CopyButton :value="item.dec" />
        <span v-if="item.bool !== undefined" class="text-xs text-muted">(as a flag: {{ item.bool }})</span>
      </div>
      <div class="flex min-w-0 items-center gap-1 text-xs text-muted">
        <span class="font-mono break-all">{{ item.hex }}</span>
        <CopyButton :value="item.hex" size="xs" />
      </div>
    </template>

    <template v-else-if="item.kind === 'cell'">
      <div v-if="item.address" class="text-sm">
        <span class="text-xs text-muted">Address</span>
        <AddressLink :address="item.address.toRawString()" full />
      </div>
      <p v-else-if="item.address === null" class="text-sm text-muted">
        Empty address (addr_none)
      </p>
      <div v-else-if="item.library" class="text-sm">
        <span class="text-xs text-muted">Library cell, points to code hash</span>
        <div class="flex min-w-0 items-center gap-1">
          <span class="font-mono text-xs break-all">{{ item.library }}</span>
          <CopyButton :value="item.library" size="xs" />
        </div>
        <ULink :to="`/tools/library-cell-resolver?q=${item.library}`" class="text-xs text-primary">Resolve the real code</ULink>
      </div>
      <div v-else-if="item.uri" class="text-sm">
        <span class="text-xs text-muted">Off-chain content URI (TEP-64)</span>
        <div class="flex min-w-0 items-center gap-1">
          <span class="font-mono text-xs break-all">{{ item.uri }}</span>
          <CopyButton :value="item.uri" size="xs" />
        </div>
      </div>
      <p v-else-if="item.onchainMeta" class="text-sm text-muted">
        On-chain metadata (TEP-64 dictionary)
      </p>
      <div v-else-if="item.text" class="text-sm">
        <span class="text-xs text-muted">Text</span>
        <p class="font-mono text-xs break-all whitespace-pre-wrap">{{ item.text }}</p>
      </div>
      <details class="mt-1 text-xs">
        <summary class="cursor-pointer text-muted">
          {{ item.bits }} bits, {{ item.refs }} refs · BOC and hash
        </summary>
        <div class="mt-1 space-y-1">
          <div class="flex min-w-0 items-center gap-1">
            <span class="text-muted">hash</span>
            <span class="font-mono break-all">{{ item.hashHex }}</span>
            <CopyButton :value="item.hashHex" size="xs" />
          </div>
          <div class="flex min-w-0 items-start gap-1">
            <span class="font-mono break-all">{{ item.boc }}</span>
            <CopyButton :value="item.boc" size="xs" />
          </div>
        </div>
      </details>
    </template>

    <template v-else-if="item.kind === 'tuple'">
      <p v-if="!item.items.length" class="text-sm text-muted">
        Empty {{ item.type }}
      </p>
      <div v-else class="space-y-2">
        <StackItem v-for="(child, i) in item.items" :key="i" :item="child" :label="`${label}[${i}]`" />
      </div>
    </template>

    <p v-else-if="item.kind === 'null'" class="text-sm text-muted">
      null
    </p>

    <pre v-else class="font-mono text-xs break-all whitespace-pre-wrap">{{ JSON.stringify(item.raw) }}</pre>
  </div>
</template>
