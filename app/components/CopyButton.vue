<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  /** Text placed on the clipboard. */
  value: string
  /** Visible label. Omit for an icon-only button. */
  label?: string
  size?: ButtonProps['size']
}>(), { size: 'sm' })

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1500)
  }
  catch {
    useToast().add({ title: 'Copy failed', description: 'Your browser blocked clipboard access. Select the text and copy it manually.', color: 'error' })
  }
}
</script>

<template>
  <UButton
    :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
    :label="label"
    :size="size"
    :color="copied ? 'success' : 'neutral'"
    variant="ghost"
    :aria-label="label ? undefined : (copied ? 'Copied' : 'Copy to clipboard')"
    :disabled="!value"
    @click="copy"
  />
</template>
