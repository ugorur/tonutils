<script setup lang="ts">
// Friendly error box. Understands TonApiError (rate limits), TonConnect rejections and plain Errors.
const props = defineProps<{
  error: unknown
  title?: string
}>()
const emit = defineEmits<{ retry: [] }>()

const view = computed(() => {
  const e = props.error
  if (!e) return null
  if (e instanceof TonApiError) {
    if (e.isRateLimit) return { title: 'Public API is busy', text: `${e.provider} allows about one request per second per visitor. Wait a few seconds and try again.`, retry: true }
    if (e.status === 0) return { title: 'Network error', text: `Could not reach ${e.provider}. Check your connection and try again.`, retry: true }
    if (e.status >= 500) return { title: `${e.provider} is having trouble`, text: e.message, retry: true }
    return { title: props.title ?? 'Request failed', text: e.message, retry: false }
  }
  const err = e as Error
  if (err?.name === 'UserRejectsError') return { title: 'Rejected in wallet', text: 'You declined the request in your wallet. Nothing was sent.', retry: false }
  return { title: props.title ?? 'Something went wrong', text: err?.message ?? String(e), retry: false }
})
</script>

<template>
  <UAlert
    v-if="view"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="view.title"
    :description="view.text"
    :actions="view.retry ? [{ label: 'Try again', color: 'error', variant: 'outline', icon: 'i-lucide-rotate-cw', onClick: () => emit('retry') }] : []"
  />
</template>
