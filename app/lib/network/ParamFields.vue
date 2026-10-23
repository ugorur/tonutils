<script setup lang="ts">
import type { ParamField } from './config'

// Decoded config param rows. Client-only (AddressLink imports @ton/core): use inside Tool.vue.
defineProps<{ fields: ParamField[] }>()
</script>

<template>
  <dl class="divide-y divide-default">
    <div v-for="f in fields" :key="f.label" class="grid grid-cols-[minmax(0,1fr)] gap-0.5 py-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-4">
      <dt class="text-xs text-muted sm:pt-0.5">
        {{ f.label }}
      </dt>
      <dd class="min-w-0 text-sm text-highlighted">
        <AddressLink v-if="f.address" :address="f.address" />
        <span v-else class="break-words [overflow-wrap:anywhere]">{{ f.value }}</span>
        <p v-if="f.hint" class="mt-0.5 text-xs break-words text-dimmed [overflow-wrap:anywhere]">
          {{ f.hint }}
        </p>
      </dd>
    </div>
  </dl>
</template>
