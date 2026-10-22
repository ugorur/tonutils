<script setup lang="ts">
import QRCode from 'qrcode'

// QR code as inline SVG (crisp at any size, theme-independent white background for scanners).
const props = withDefaults(defineProps<{
  value: string
  /** Rendered width/height in px. */
  size?: number
  /** Error correction: L 7%, M 15%, Q 25%, H 30%. */
  level?: 'L' | 'M' | 'Q' | 'H'
}>(), { size: 220, level: 'M' })

const svg = ref('')
const error = ref('')
watch(() => [props.value, props.level], async () => {
  error.value = ''
  if (!props.value) {
    svg.value = ''
    return
  }
  try {
    svg.value = await QRCode.toString(props.value, { type: 'svg', margin: 2, errorCorrectionLevel: props.level })
  }
  catch (e) {
    svg.value = ''
    error.value = (e as Error).message
  }
}, { immediate: true })

defineExpose({ svg })
</script>

<template>
  <div>
    <!-- eslint-disable-next-line vue/no-v-html -- SVG generated locally by the qrcode library -->
    <div v-if="svg" class="overflow-hidden rounded-lg bg-white p-1 [&>svg]:size-full" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="`QR code: ${value}`" v-html="svg" />
    <p v-else-if="error" class="text-sm text-error">
      Cannot encode as QR: {{ error }}
    </p>
  </div>
</template>
