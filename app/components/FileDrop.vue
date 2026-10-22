<script lang="ts">
// Drop zone + file picker. Reads the file in the browser (never uploads) and emits bytes and, for text, a string.
export interface DroppedFile {
  name: string
  size: number
  type: string
  bytes: Uint8Array
  /** UTF-8 decoded content when `text` is set. */
  text?: string
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** <input accept>, e.g. ".boc,.json". */
  accept?: string
  /** Also decode as UTF-8 text. */
  text?: boolean
  /** Max size in bytes (default 10 MB). */
  maxBytes?: number
  label?: string
}>(), { maxBytes: 10 * 1024 * 1024, label: 'Drop a file here or click to choose' })
const emit = defineEmits<{ file: [file: DroppedFile] }>()

const over = ref(false)
const error = ref('')
const input = ref<HTMLInputElement>()

async function read(file: File | undefined) {
  error.value = ''
  if (!file) return
  if (file.size > props.maxBytes) {
    error.value = `File is too large (max ${Math.round(props.maxBytes / 1024 / 1024)} MB).`
    return
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  emit('file', { name: file.name, size: file.size, type: file.type, bytes, text: props.text ? new TextDecoder().decode(bytes) : undefined })
}

function onDrop(e: DragEvent) {
  over.value = false
  read(e.dataTransfer?.files[0])
}
</script>

<template>
  <div>
    <button
      type="button"
      class="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors"
      :class="over ? 'border-primary bg-primary/5 text-highlighted' : 'border-accented text-muted hover:border-primary/60'"
      @click="input?.click()"
      @dragover.prevent="over = true"
      @dragleave="over = false"
      @drop.prevent="onDrop"
    >
      <UIcon name="i-lucide-upload" class="size-6" />
      <span>{{ label }}</span>
      <span class="text-xs text-dimmed">Read in your browser, never uploaded.</span>
    </button>
    <input ref="input" type="file" class="hidden" :accept="accept" @change="read(($event.target as HTMLInputElement).files?.[0]); ($event.target as HTMLInputElement).value = ''">
    <p v-if="error" class="mt-2 text-sm text-error">
      {{ error }}
    </p>
  </div>
</template>
