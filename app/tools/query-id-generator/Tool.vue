<script setup lang="ts">
import type { GenMode } from './logic'
import { decodeQueryId, GEN_MODES, generate, parseQueryId } from './logic'

const EXAMPLES = [
  { label: 'Date.now() id', value: '1792742811625' },
  { label: 'Nanosecond id', value: '1792742809157419873' },
  { label: 'Random id', value: '17886206263971382616' }
]

// generate
const mode = ref<GenMode>('random')
const count = ref(1)
const ttl = ref(60)
const startText = ref('1')
const start = computed(() => {
  try {
    return parseQueryId(startText.value)
  }
  catch {
    return null
  }
})
const asHex = ref(false)
const ids = ref<bigint[]>([])
function run() {
  if (mode.value === 'sequential' && start.value === null) return
  ids.value = generate({ mode: mode.value, count: count.value || 1, nowMs: Date.now(), ttl: ttl.value, start: start.value ?? 0n })
}
onMounted(run)
watch(mode, run)
const show = (v: bigint) => (asHex.value ? `0x${v.toString(16).padStart(16, '0')}` : v.toString())
const allText = computed(() => ids.value.map(show).join('\n'))

// decode
const decText = ref('')
const decoded = computed(() => {
  if (!decText.value.trim()) return null
  try {
    return { ok: true as const, ...decodeQueryId(parseQueryId(decText.value), Math.floor(Date.now() / 1000)) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const utc = (t: number) => new Date(t * 1000).toISOString().replace('T', ' ').replace('Z', ' UTC')
</script>

<template>
  <div class="space-y-6">
    <p class="text-sm text-muted">
      <code class="font-mono">query_id</code> is a 64-bit number you put in jetton, NFT and other contract messages. The contract copies it into its reply (for example the excess refund), so you can match responses to requests. Any value works; it only has to be unique enough for you.
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-dices" class="size-4 text-primary" /> Generate
          </div>
        </template>
        <div class="space-y-4">
          <URadioGroup v-model="mode" :items="GEN_MODES" size="sm" />
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="How many">
              <UInputNumber v-model="count" :min="1" :max="1000" class="w-full" />
            </UFormField>
            <UFormField v-if="mode === 'expiry-shift'" label="Expires in (s)">
              <UInputNumber v-model="ttl" :min="0" class="w-full" />
            </UFormField>
            <UFormField v-if="mode === 'sequential'" label="Start at" :error="start === null ? 'uint64' : undefined">
              <UInput v-model="startText" inputmode="numeric" class="w-full" :ui="{ base: 'font-mono' }" />
            </UFormField>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UButton icon="i-lucide-refresh-cw" label="Generate" data-testid="generate" @click="run" />
            <USwitch v-model="asHex" label="Hex" />
            <CopyButton v-if="ids.length > 1" :value="allText" label="Copy all" size="sm" />
          </div>
          <ul class="max-h-80 divide-y divide-default overflow-y-auto rounded-md border border-default" data-testid="ids">
            <li v-for="(v, i) in ids" :key="i" class="flex items-center gap-2 px-3 py-1.5">
              <span class="min-w-0 flex-1 break-all font-mono text-sm text-highlighted">{{ show(v) }}</span>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-search" aria-label="Decode" @click="decText = v.toString()" />
              <CopyButton :value="show(v)" size="xs" />
            </li>
          </ul>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2 font-medium text-highlighted">
            <UIcon name="i-lucide-binary" class="size-4 text-primary" /> Decode
          </div>
        </template>
        <div class="space-y-3">
          <UFormField label="query_id" :error="decoded && !decoded.ok ? decoded.error : undefined" hint="decimal, 0x… or 0b…">
            <UInput v-model="decText" placeholder="1792742811625" class="w-full" :ui="{ base: 'font-mono' }" data-testid="decode-input" />
          </UFormField>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            Real mainnet ids:
            <UButton v-for="e in EXAMPLES" :key="e.value" size="xs" variant="soft" :label="e.label" @click="decText = e.value" />
          </div>
          <template v-if="decoded?.ok">
            <KeyValue
              :items="[
                { label: 'Decimal', value: decoded.decimal },
                { label: 'Hex (64-bit)', value: decoded.hex },
                { label: 'High 32 / low 32 bits', value: `${decoded.high32} / ${decoded.low32}`, copy: false }
              ]"
            />
            <div class="space-y-2" data-testid="interpretations">
              <div v-for="it in decoded.interpretations" :key="it.label" class="rounded-md border border-default p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="it.unix !== undefined ? 'primary' : 'neutral'" variant="subtle" :label="it.label" />
                  <span v-if="it.unix !== undefined" class="font-mono text-sm text-highlighted">{{ utc(it.unix) }}</span>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ it.detail }}
                </p>
              </div>
            </div>
          </template>
        </div>
      </UCard>
    </div>
  </div>
</template>
