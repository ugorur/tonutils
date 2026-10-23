<script setup lang="ts">
// Multi-file source editor: file tabs (first = entrypoint), add/rename/remove, open files from disk (read locally).
import { freeName, normalizePath, type SourceFile } from './files'

const props = withDefaults(defineProps<{
  /** Extension for new files, e.g. 'tolk' or 'fc'. */
  ext: string
  /** <input accept> for "Open files". */
  accept?: string
  label?: string
  placeholder?: string
  readonly?: boolean
}>(), { label: 'Source files' })

const files = defineModel<SourceFile[]>({ required: true })
const active = defineModel<number>('active', { default: 0 })

const input = ref<HTMLInputElement>()
const current = computed(() => files.value[Math.min(active.value, files.value.length - 1)])

const lines = computed(() => current.value?.content.split('\n').length ?? 0)

function update(patch: Partial<SourceFile>) {
  const i = Math.min(active.value, files.value.length - 1)
  files.value = files.value.map((f, j) => (j === i ? { ...f, ...patch } : f))
}

function add() {
  files.value = [...files.value, { path: freeName(files.value, `file.${props.ext}`), content: '' }]
  active.value = files.value.length - 1
}

function remove(i: number) {
  if (files.value.length < 2) return
  files.value = files.value.filter((_, j) => j !== i)
  if (active.value >= files.value.length) active.value = files.value.length - 1
}

function makeEntry(i: number) {
  const f = files.value[i]!
  files.value = [f, ...files.value.filter((_, j) => j !== i)]
  active.value = 0
}

async function open(e: Event) {
  const list = [...((e.target as HTMLInputElement).files ?? [])]
  ;(e.target as HTMLInputElement).value = ''
  if (!list.length) return
  const read = await Promise.all(list.map(async f => ({ path: f.name, content: await f.text() })))
  // Replace a single empty starter file instead of keeping it around.
  const base = files.value.length === 1 && !files.value[0]!.content.trim() ? [] : files.value
  const merged = [...base]
  for (const f of read) {
    const i = merged.findIndex(m => normalizePath(m.path) === normalizePath(f.path))
    if (i >= 0) merged[i] = f
    else merged.push(f)
  }
  files.value = merged
  active.value = merged.findIndex(m => m.path === read[0]!.path)
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-medium text-highlighted">{{ label }}</span>
      <div v-if="!readonly" class="flex gap-1">
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-file-plus" label="New file" @click="add" />
        <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-file-up" label="Open files" @click="input?.click()" />
        <input ref="input" type="file" multiple :accept="accept" class="hidden" @change="open">
      </div>
    </div>

    <div class="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Files">
      <div
        v-for="(f, i) in files"
        :key="i"
        class="flex shrink-0 items-center rounded-md border text-xs"
        :class="i === active ? 'border-primary bg-primary/10 text-highlighted' : 'border-default text-muted hover:text-default'"
      >
        <button type="button" role="tab" :aria-selected="i === active" class="max-w-56 truncate px-2 py-1 font-mono" :title="f.path" @click="active = i">
          {{ f.path || '(unnamed)' }}
        </button>
        <UBadge v-if="i === 0 && files.length > 1" label="entry" size="sm" variant="soft" class="mr-1" />
        <button v-if="!readonly && files.length > 1" type="button" class="px-1 py-1 hover:text-error" :aria-label="`Remove ${f.path}`" @click="remove(i)">
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </div>
    </div>

    <template v-if="current">
      <div v-if="!readonly" class="flex flex-wrap items-center gap-2">
        <UInput
          :model-value="current.path"
          size="sm"
          class="min-w-0 flex-1"
          :ui="{ base: 'font-mono text-xs' }"
          aria-label="File path"
          spellcheck="false"
          @update:model-value="update({ path: String($event) })"
        />
        <UButton v-if="active > 0" size="xs" variant="soft" color="neutral" label="Make entrypoint" @click="makeEntry(active)" />
      </div>
      <UTextarea
        :model-value="current.content"
        :rows="16"
        :maxrows="32"
        autoresize
        :readonly="readonly"
        class="w-full"
        :ui="{ base: 'font-mono text-xs leading-relaxed whitespace-pre overflow-x-auto' }"
        :placeholder="placeholder"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        :aria-label="`Contents of ${current.path}`"
        @update:model-value="update({ content: String($event) })"
      />
      <p class="text-xs text-dimmed">
        {{ lines }} lines<template v-if="files.length > 1">
          · imports resolve by these paths, relative to the importing file
        </template>
      </p>
    </template>
  </div>
</template>
