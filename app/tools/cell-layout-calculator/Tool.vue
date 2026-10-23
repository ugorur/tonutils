<script setup lang="ts">
import type { Chain, Field, FieldSize, FieldType } from './logic'
import { computeLayout, estimateFees, FIELD_TYPES, MAX_BITS, MAX_REFS, PRESETS } from './logic'

const fields = ref<Field[]>(PRESETS[0]!.fields.map(f => ({ ...f })))
const chain = ref<Chain>('basechain')
const typeItems = (Object.keys(FIELD_TYPES) as FieldType[]).map(v => ({ label: FIELD_TYPES[v].label, value: v }))

function setType(f: Field, t: FieldType) {
  f.type = t
  f.n = FIELD_TYPES[t].param?.default
}
function add() {
  fields.value.push({ name: `field_${fields.value.length + 1}`, type: 'uint', n: 32 })
}
function load(i: number) {
  fields.value = PRESETS[i]!.fields.map(f => ({ ...f }))
}

const result = computed(() => {
  try {
    const layout = computeLayout(fields.value)
    return { ok: true as const, layout, fees: estimateFees(layout, chain.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function range(a: number, b: number, unit: string) {
  return a === b ? `${a} ${unit}` : `${a}–${b} ${unit}`
}
function sizeLabel(s: FieldSize) {
  return [range(s.minBits, s.maxBits, 'bits'), s.maxRefs ? range(s.minRefs, s.maxRefs, s.maxRefs > 1 ? 'refs' : 'ref') : ''].filter(Boolean).join(', ')
}
function sizeAt(i: number) {
  const s = result.value.ok ? result.value.layout.fields[i]?.size : undefined
  return s ? sizeLabel(s) : ''
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">Examples:</span>
      <UButton v-for="(p, i) in PRESETS" :key="p.label" :label="p.label" size="xs" color="neutral" variant="outline" @click="load(i)" />
    </div>

    <div class="space-y-2">
      <div v-for="(f, i) in fields" :key="i" class="grid grid-cols-[1fr_auto] items-start gap-2 rounded-lg border border-default p-2 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_6rem_minmax(0,1fr)_auto] sm:items-center sm:border-0 sm:p-0">
        <UInput v-model="f.name" placeholder="name" class="w-full" :ui="{ base: 'font-mono' }" :aria-label="`Field ${i + 1} name`" />
        <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="sm" :aria-label="`Remove ${f.name}`" class="sm:order-last" @click="fields.splice(i, 1)" />
        <USelect :model-value="f.type" :items="typeItems" class="w-full" :aria-label="`Field ${i + 1} type`" @update:model-value="setType(f, $event as FieldType)" />
        <UInput
          v-if="FIELD_TYPES[f.type].param"
          v-model.number="f.n"
          type="number"
          :min="FIELD_TYPES[f.type].param!.min"
          :max="FIELD_TYPES[f.type].param!.max"
          class="w-full"
          :aria-label="`${f.name} ${FIELD_TYPES[f.type].param!.label}`"
        />
        <span v-else class="hidden sm:block" />
        <span class="col-span-2 text-xs text-muted sm:col-span-1" :title="FIELD_TYPES[f.type].hint">{{ sizeAt(i) }}</span>
      </div>
      <UButton label="Add field" icon="i-lucide-plus" size="sm" color="neutral" variant="outline" @click="add" />
    </div>

    <UAlert v-if="!result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="result.ok && fields.length">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Bits (min–max)
          </div>
          <div class="font-mono text-lg text-highlighted">
            {{ range(result.layout.total.minBits, result.layout.total.maxBits, '') }} <span class="text-sm text-muted">/ {{ MAX_BITS }}</span>
          </div>
          <UProgress :model-value="Math.min(100, (result.layout.total.maxBits / MAX_BITS) * 100)" :color="result.layout.total.maxBits > MAX_BITS ? 'error' : 'primary'" size="sm" class="mt-2" />
        </div>
        <div class="rounded-lg border border-default p-4">
          <div class="text-xs text-muted">
            Refs (min–max)
          </div>
          <div class="font-mono text-lg text-highlighted">
            {{ range(result.layout.total.minRefs, result.layout.total.maxRefs, '') }} <span class="text-sm text-muted">/ {{ MAX_REFS }}</span>
          </div>
          <UProgress :model-value="Math.min(100, (result.layout.total.maxRefs / MAX_REFS) * 100)" :color="result.layout.total.maxRefs > MAX_REFS ? 'error' : 'primary'" size="sm" class="mt-2" />
        </div>
      </div>

      <UAlert
        v-if="result.layout.fits"
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        title="Fits in one cell"
        :description="`Worst case leaves ${MAX_BITS - result.layout.total.maxBits} bits and ${MAX_REFS - result.layout.total.maxRefs} refs free.`"
      />
      <template v-else>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Does not fit in one cell"
          description="A cell holds at most 1023 bits and 4 refs. Here is a split that keeps your field order and continues in the last ref of each cell."
        />
        <ol class="space-y-2">
          <li v-for="(c, i) in result.layout.plan" :key="i" class="rounded-lg border border-default p-3 text-sm">
            <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span class="font-medium text-highlighted">{{ i === 0 ? 'Root cell' : `Cell ${i + 1} (ref from cell ${i})` }}</span>
              <span class="font-mono text-xs text-muted">≤ {{ c.maxBits }} bits, ≤ {{ c.maxRefs }} ref{{ c.maxRefs === 1 ? '' : 's' }}</span>
            </div>
            <p class="font-mono text-xs break-words text-muted">
              {{ c.fields.map(f => f.field.name).join(', ') }}{{ i < result.layout.plan.length - 1 ? ', ^next' : '' }}
            </p>
          </li>
        </ol>
      </template>

      <div class="space-y-3 rounded-lg border border-default p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Cost estimate (worst case)
          </h3>
          <UTabs v-model="chain" :content="false" size="xs" :items="[{ label: 'Basechain', value: 'basechain' }, { label: 'Masterchain', value: 'masterchain' }]" />
        </div>
        <KeyValue
          :items="[
            { label: `Storage for 1 year (${result.fees.cells} cell${result.fees.cells > 1 ? 's' : ''}, ${result.fees.bits} bits)`, value: formatCoin(result.fees.storagePerYear), copy: false, mono: false },
            { label: 'Forward fee if sent as a message body', value: `${formatCoin(result.fees.forward.total)} paid by the sender`, copy: false, mono: false, hint: `Assumes the body is a ref cell, as it is for most bodies (a body only goes inline when it fits next to the message header). The message itself carries fwd_fee ${formatCoin(result.fees.forward.fwdFee)}.` }
          ]"
        />
        <p class="text-xs text-dimmed">
          Prices from mainnet config params 18, 24 and 25 as of October 2026. Cells behind ^Cell and dictionary refs are not counted:
          add their sizes yourself. Gas is not included.
        </p>
      </div>
    </template>
  </div>
</template>
