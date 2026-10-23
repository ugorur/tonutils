<script setup lang="ts">
import QRCode from 'qrcode'

// QR of a payment link with PNG / SVG downloads (generated locally by the qrcode library).
const props = withDefaults(defineProps<{
  value: string
  /** Download file name without extension. */
  filename?: string
  size?: number
}>(), { filename: 'payment-qr', size: 220 })

const qr = ref<{ svg: string } | null>(null)

async function downloadPng() {
  const url = await QRCode.toDataURL(props.value, { width: 1024, margin: 2, errorCorrectionLevel: 'M' })
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.filename}.png`
  a.click()
}
function downloadSvg() {
  if (qr.value?.svg) downloadText(qr.value.svg, `${props.filename}.svg`, 'image/svg+xml')
}
</script>

<template>
  <div class="flex flex-col items-center gap-2">
    <QrCode ref="qr" :value="value" :size="size" />
    <div class="flex gap-2">
      <UButton label="PNG" icon="i-lucide-download" size="xs" variant="outline" color="neutral" data-testid="qr-png" @click="downloadPng" />
      <UButton label="SVG" icon="i-lucide-download" size="xs" variant="outline" color="neutral" @click="downloadSvg" />
    </div>
  </div>
</template>
