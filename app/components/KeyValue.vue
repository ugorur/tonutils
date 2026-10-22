<script lang="ts">
export interface KeyValueItem {
  label: string
  value: string
  mono?: boolean
  copy?: boolean
  hint?: string
}
</script>

<script setup lang="ts">
defineProps<{ items: KeyValueItem[] }>()
</script>

<template>
  <div class="divide-y divide-default">
    <ResultField
      v-for="item in items"
      :key="item.label"
      :label="item.label"
      :value="item.value"
      :mono="item.mono ?? true"
      :copy="item.copy ?? true"
      :hint="item.hint"
    />
  </div>
</template>
