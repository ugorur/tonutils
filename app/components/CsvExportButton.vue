<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

// Downloads rows as CSV (Excel/Sheets friendly, UTF-8 BOM). Generated in the browser.
const props = withDefaults(defineProps<{
  rows: CsvRow[]
  filename: string
  columns?: string[]
  label?: string
  size?: ButtonProps['size']
}>(), { label: 'Export CSV', size: 'sm' })

function download() {
  const name = props.filename.endsWith('.csv') ? props.filename : `${props.filename}.csv`
  downloadText('﻿' + toCsv(props.rows, props.columns), name, 'text/csv;charset=utf-8')
}
</script>

<template>
  <UButton icon="i-lucide-download" :label="label" :size="size" color="neutral" variant="outline" :disabled="!rows.length" @click="download" />
</template>
