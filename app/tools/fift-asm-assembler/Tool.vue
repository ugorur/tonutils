<script setup lang="ts">
import { loadTasm } from '~/utils/lazy'
import { assemble, detectMode, loadFift, type Assembled, type AsmMode } from './logic'
import tolkCounter from './fixtures/tolk-counter.json'

const EXAMPLES = [
  { label: 'Tiny TASM (1 + 2)', value: 'PUSHINT_4 1\nPUSHINT_4 2\nADD\n' },
  { label: 'Tolk counter (Fift PROGRAM)', value: tolkCounter.fift }
]

const src = ref('')
const modeChoice = ref<'auto' | AsmMode>('auto')
const mode = computed<AsmMode>(() => (modeChoice.value === 'auto' ? detectMode(src.value) : modeChoice.value))
const MODE_ITEMS = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'TASM (@ton/tasm, tonviewer)', value: 'tasm' },
  { label: 'Fift PROGRAM{ … }END>c', value: 'fift' }
]

const loading = ref(false)
const error = ref<unknown>(null)
const result = shallowRef<Assembled | null>(null)

async function run() {
  error.value = null
  loading.value = true
  try {
    const [tasm, fift] = await Promise.all([loadTasm(), mode.value === 'fift' ? loadFift() : null])
    result.value = assemble(tasm, fift, src.value, mode.value)
  }
  catch (e) {
    result.value = null
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function download() {
  if (!result.value) return
  const blob = new Blob([new Uint8Array(result.value.cell.toBoc())], { type: 'application/octet-stream' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${result.value.hashHex.slice(0, 12)}.boc`
  a.click()
  URL.revokeObjectURL(a.href)
}

watch(src, () => { result.value = null })
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-3" @submit.prevent="run">
      <UFormField label="Assembly" :hint="mode === 'fift' ? 'Fift assembly detected' : 'TASM (one instruction per line)'">
        <UTextarea
          v-model="src"
          :rows="12"
          autoresize
          :maxrows="30"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="PUSHINT_4 1&#10;PUSHINT_4 2&#10;ADD"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <UButton
          v-for="ex in EXAMPLES"
          :key="ex.label"
          :label="ex.label"
          icon="i-lucide-sparkles"
          variant="link"
          size="sm"
          class="px-0"
          @click="src = ex.value"
        />
        <UButton v-if="src" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="src = ''" />
      </div>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <USelect v-model="modeChoice" :items="MODE_ITEMS" class="w-full sm:w-72" aria-label="Syntax" />
        <UButton type="submit" label="Assemble" icon="i-lucide-hammer" :loading="loading" :disabled="!src.trim()" class="justify-center" />
      </div>
      <p class="text-xs text-dimmed">
        TASM is the format of the <ULink to="/tools/code-disassembler" class="text-primary">disassembler</ULink> and tonviewer's Code tab
        (explicit forms like <code>PUSHINT_4 5</code>, <code>PUSHINT_LONG 1000</code>). Fift mode takes the full
        <code>PROGRAM{ … }END>c</code> that FunC and Tolk compilers print. Everything runs locally.
      </p>
    </form>

    <ErrorNotice v-if="error" :error="error" title="Could not assemble" />
    <LoadingState v-else-if="loading" label="Assembling…" />

    <template v-if="result && !loading">
      <div class="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <ResultField label="Code hash (hex)" :value="result.hashHex" />
        <ResultField label="Code hash (base64)" :value="result.hashBase64" />
        <ResultField label="Size" :value="`${result.cells} cell${result.cells === 1 ? '' : 's'}, ${result.bits} bits`" :mono="false" :copy="false" />
      </div>
      <ResultField label="Code BOC (base64)" :value="result.boc64" />
      <ResultField label="Code BOC (hex)" :value="result.hex" />
      <div class="flex flex-wrap gap-2">
        <UButton label="Download .boc" icon="i-lucide-download" variant="soft" @click="download" />
      </div>
      <details class="rounded-md border border-default">
        <summary class="cursor-pointer px-3 py-2 text-sm">
          Round trip: disassembly of the result
        </summary>
        <div class="space-y-2 border-t border-default p-3">
          <p class="text-xs text-muted">
            The code cell decoded back to TASM. If it reads like your input, every instruction was encoded as intended.
          </p>
          <pre class="max-h-96 overflow-auto font-mono text-xs leading-5">{{ result.roundTrip }}</pre>
          <CopyButton :value="result.roundTrip" label="Copy" />
        </div>
      </details>
    </template>
  </div>
</template>
