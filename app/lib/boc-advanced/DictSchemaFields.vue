<script setup lang="ts">
// Key type + value layout (+ storage layout) pickers for the dictionary tools.
import type { DictLayout } from './dict'
import { DICT_PRESETS } from './dict'

// presetLayout=false: picking a preset leaves the storage layout alone (a Merkle proof's virtual root is the bare Hashmap
// whatever layout the source dictionary used).
const props = withDefaults(defineProps<{ showLayout?: boolean, presetLayout?: boolean }>(), { showLayout: true, presetLayout: true })
const keySpec = defineModel<string>('keySpec', { required: true })
const valueSpec = defineModel<string>('valueSpec', { required: true })
const layout = defineModel<DictLayout>('layout', { default: 'auto' })

const presetItems = DICT_PRESETS.map(p => ({ label: p.label, value: p.id }))
const match = () => DICT_PRESETS.find(p => p.key === keySpec.value && p.value === valueSpec.value)?.id ?? 'custom'
const preset = ref(match())
watch([keySpec, valueSpec], () => {
  preset.value = match()
})
function applyPreset(id: string) {
  preset.value = id
  const p = DICT_PRESETS.find(x => x.id === id)
  if (!p || id === 'custom') return
  keySpec.value = p.key
  valueSpec.value = p.value
  if (props.presetLayout) layout.value = p.layout
}
const presetHint = computed(() => DICT_PRESETS.find(p => p.id === preset.value)?.hint)

const layoutItems = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'Hashmap root (direct)', value: 'direct' },
  { label: 'HashmapE (1 bit + ref)', value: 'hashmapE' },
  { label: 'TEP-64 content (0x00 + HashmapE)', value: 'tep64' }
]
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <UFormField label="Dictionary type" :description="presetHint" class="sm:col-span-2">
      <USelect :model-value="preset" :items="presetItems" class="w-full" @update:model-value="applyPreset($event as string)" />
    </UFormField>
    <UFormField label="Key type" description="uint<N>, int<N>, address, bits<N>, or sha256 (TEP-64 field names)">
      <UInput v-model="keySpec" class="w-full font-mono" placeholder="uint32" />
    </UFormField>
    <UFormField label="Value fields" description="e.g. coins · ref · content · amount:coins, until:uint48">
      <UInput v-model="valueSpec" class="w-full font-mono" placeholder="coins" />
    </UFormField>
    <UFormField v-if="showLayout" label="How the dictionary is stored" class="sm:col-span-2">
      <USelect v-model="layout" :items="layoutItems" class="w-full" />
    </UFormField>
  </div>
</template>
