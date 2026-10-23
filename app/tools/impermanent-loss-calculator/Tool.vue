<script setup lang="ts">
import { formatFiat } from '~/lib/accounts/core'
import { breakEvenApr, curve, formatMultiplier, impermanentLoss, REFERENCE_RATIOS, simulate, validate } from './logic'

const symA = ref(COIN_SYMBOL)
const symB = ref('USD₮')
const deposit = ref(1000)
const priceA0 = ref(2)
const priceA1 = ref(1.32)
const priceB0 = ref(1)
const priceB1 = ref(1)
const days = ref(90)

const input = computed(() => ({ deposit: deposit.value, priceA0: priceA0.value, priceA1: priceA1.value, priceB0: priceB0.value, priceB1: priceB1.value }))
const error = computed(() => validate(input.value))
const result = computed(() => (error.value ? null : simulate(input.value)))
const apr = computed(() => (result.value && days.value > 0 ? breakEvenApr(result.value.breakEvenFees, days.value) : null))

const PRESETS = [
  { label: `${COIN_SYMBOL} −50%`, a: 0.5 },
  { label: `${COIN_SYMBOL} +50%`, a: 1.5 },
  { label: `${COIN_SYMBOL} 2×`, a: 2 },
  { label: `${COIN_SYMBOL} 5×`, a: 5 }
]
function preset(a: number) {
  symA.value = COIN_SYMBOL
  symB.value = 'USD₮'
  priceA0.value = 1.32
  priceA1.value = Math.round(1.32 * a * 10000) / 10000
  priceB0.value = 1
  priceB1.value = 1
}

const pct = (v: number, d = 2) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`
const num = (v: number) => v.toLocaleString('en-US', { maximumSignificantDigits: 6 })
const money = (v: number) => formatFiat(v, 'USD')

// ---- chart: IL (y) against the A/B price-ratio change (x, log scale 0.1x..10x) ----
const W = 600
const H = 220
const PAD = { l: 44, r: 12, t: 12, b: 28 }
const Y_MIN = -0.45
const xOf = (r: number) => PAD.l + ((Math.log10(r) + 1) / 2) * (W - PAD.l - PAD.r)
const yOf = (il: number) => PAD.t + (il / Y_MIN) * (H - PAD.t - PAD.b)
const path = curve(0.1, 10, 161).map((p, i) => `${i ? 'L' : 'M'}${xOf(p.r).toFixed(1)},${yOf(p.il).toFixed(1)}`).join('')
const X_TICKS = [0.1, 0.25, 0.5, 1, 2, 4, 10]
const Y_TICKS = [0, -0.1, -0.2, -0.3, -0.4]
const marker = computed(() => {
  const r = result.value?.ratio
  if (!r) return null
  const clamped = Math.min(10, Math.max(0.1, r))
  return { x: xOf(clamped), y: yOf(impermanentLoss(clamped)), out: clamped !== r }
})
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2">
      <fieldset class="space-y-3 rounded-lg border border-default p-4">
        <legend class="px-1 text-sm font-medium text-highlighted">
          Token A
        </legend>
        <UFormField label="Symbol">
          <UInput v-model="symA" class="w-full" maxlength="12" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Entry price (USD)">
            <UInput v-model.number="priceA0" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
          </UFormField>
          <UFormField label="Current price (USD)">
            <UInput v-model.number="priceA1" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
          </UFormField>
        </div>
      </fieldset>
      <fieldset class="space-y-3 rounded-lg border border-default p-4">
        <legend class="px-1 text-sm font-medium text-highlighted">
          Token B
        </legend>
        <UFormField label="Symbol">
          <UInput v-model="symB" class="w-full" maxlength="12" />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Entry price (USD)">
            <UInput v-model.number="priceB0" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
          </UFormField>
          <UFormField label="Current price (USD)">
            <UInput v-model.number="priceB1" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
          </UFormField>
        </div>
      </fieldset>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Amount deposited (USD)" help="Split 50/50 between the two tokens at entry.">
        <UInput v-model.number="deposit" type="number" min="0" step="any" inputmode="decimal" class="w-full" />
      </UFormField>
      <UFormField label="Days in the pool" help="Used for the break-even fee rate.">
        <UInput v-model.number="days" type="number" min="1" step="1" inputmode="numeric" class="w-full" />
      </UFormField>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">Try:</span>
      <UButton v-for="p in PRESETS" :key="p.label" :label="`${p.label} vs USD₮`" size="xs" variant="soft" @click="preset(p.a)" />
    </div>

    <UAlert v-if="error" color="warning" variant="subtle" icon="i-lucide-info" :title="error" />

    <template v-if="result">
      <section class="rounded-lg border border-default p-4 sm:p-5">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div class="text-xs text-muted">
              Impermanent loss vs holding
            </div>
            <div class="font-display text-3xl font-semibold" :class="result.il < -0.00005 ? 'text-error' : 'text-highlighted'">
              {{ pct(result.il) }}
            </div>
            <div class="mt-1 text-sm text-muted">
              {{ money(result.difference) }} on {{ money(deposit) }} · {{ symA || 'A' }}/{{ symB || 'B' }} price moved {{ formatMultiplier(result.ratio) }}
            </div>
          </div>
        </div>
        <KeyValue
          class="mt-4"
          :items="[
            { label: 'Value if you had held', value: money(result.holdValue), mono: false, copy: false },
            { label: 'Value in the pool (before fees)', value: money(result.lpValue), mono: false, copy: false },
            { label: 'Tokens at entry', value: `${num(result.entry.a)} ${symA} + ${num(result.entry.b)} ${symB}`, mono: false, copy: false },
            { label: 'Tokens in the pool now', value: `${num(result.now.a)} ${symA} + ${num(result.now.b)} ${symB}`, mono: false, copy: false },
            { label: 'Fees needed to break even', value: `${pct(result.breakEvenFees)} of the position${apr !== null ? ` (≈ ${(apr * 100).toFixed(2)}% APR over ${days} days)` : ''}`, mono: false, copy: false, hint: 'Compare with the pool APR shown on STON.fi or DeDust.' }
          ]"
        />
      </section>

      <section>
        <h3 class="text-sm font-semibold text-highlighted">
          Loss curve
        </h3>
        <p class="mt-1 text-xs text-muted">
          Impermanent loss against the change in the {{ symA || 'A' }}/{{ symB || 'B' }} price ratio. The dot is your scenario<template v-if="marker?.out">
            (clamped to the chart edge)
          </template>.
        </p>
        <svg :viewBox="`0 0 ${W} ${H}`" class="mt-2 h-auto w-full" role="img" :aria-label="`Impermanent loss curve; your scenario loses ${pct(result.il)}`">
          <g class="text-dimmed" stroke="currentColor" stroke-opacity="0.25">
            <line v-for="t in Y_TICKS" :key="`y${t}`" :x1="PAD.l" :x2="W - PAD.r" :y1="yOf(t)" :y2="yOf(t)" />
            <line v-for="t in X_TICKS" :key="`x${t}`" :x1="xOf(t)" :x2="xOf(t)" :y1="PAD.t" :y2="H - PAD.b" />
          </g>
          <g class="fill-current text-muted" font-size="11">
            <text v-for="t in Y_TICKS" :key="`yl${t}`" :x="PAD.l - 6" :y="yOf(t) + 4" text-anchor="end">{{ Math.round(t * 100) }}%</text>
            <text v-for="t in X_TICKS" :key="`xl${t}`" :x="xOf(t)" :y="H - 8" text-anchor="middle">{{ t }}×</text>
          </g>
          <path :d="path" fill="none" class="stroke-primary" stroke-width="2.5" />
          <circle v-if="marker" :cx="marker.x" :cy="marker.y" r="6" class="fill-error stroke-default" stroke-width="2" />
        </svg>
      </section>

      <section>
        <h3 class="text-sm font-semibold text-highlighted">
          Quick reference
        </h3>
        <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div v-for="r in REFERENCE_RATIOS" :key="r" class="rounded-md border border-default px-3 py-2">
            <div class="text-xs text-muted">
              {{ formatMultiplier(r) }} or {{ formatMultiplier(1 / r) }}
            </div>
            <div class="font-mono text-sm text-highlighted">
              {{ pct(impermanentLoss(r)) }}
            </div>
          </div>
        </div>
      </section>
    </template>

    <p class="text-xs text-dimmed">
      Assumes a 50/50 constant-product pool (x·y = k), the type behind STON.fi constant-product pools and DeDust volatile pools. Trading fees and farm rewards are not included: they offset the loss. Stable pools (DeDust stable, STON.fi stableswap) lose less while prices stay near the peg, so treat these numbers as approximate there. The loss is "impermanent" because it disappears if prices return to where you entered. {{ COIN_RENAME_NOTE }}
    </p>
  </div>
</template>
