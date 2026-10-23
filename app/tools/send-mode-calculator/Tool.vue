<script setup lang="ts">
import type { Note } from './logic'
import { composeMode, explainReserveMode, explainSendMode, parseMode, RESERVE_BITS, RESERVE_PRESETS, SEND_BASES, SEND_FLAGS, SEND_PRESETS, simulateReserve } from './logic'

const tab = ref<'send' | 'reserve'>('send')
const tabs = [
  { label: 'Send mode', value: 'send', icon: 'i-lucide-send' },
  { label: 'Reserve mode', value: 'reserve', icon: 'i-lucide-lock' }
]

const NOTE_UI: Record<Note['severity'], { color: 'error' | 'warning' | 'info', icon: string }> = {
  error: { color: 'error', icon: 'i-lucide-circle-x' },
  warning: { color: 'warning', icon: 'i-lucide-triangle-alert' },
  info: { color: 'info', icon: 'i-lucide-info' }
}

// ---------------------------------------------------------------- send mode
const sendText = ref('3')
const external = ref(false)
const sendParsed = computed(() => {
  try {
    return { ok: true as const, mode: parseMode(sendText.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const send = computed(() => (sendParsed.value.ok ? explainSendMode(sendParsed.value.mode, { external: external.value }) : null))
const sendBase = computed({
  get: () => String(send.value?.base ?? 0),
  set: v => (sendText.value = String(composeMode(Number(v), send.value?.flags ?? [])))
})
function toggleFlag(v: number, on: boolean) {
  const m = send.value?.mode ?? 0
  sendText.value = String(on ? m | v : m & ~v)
}
const hasBit = (m: number | undefined, v: number) => m !== undefined && (m & v) === v

const sendCode = computed(() => {
  const s = send.value
  if (!s?.valid) return null
  const parts = [...SEND_BASES.filter(b => b.value && hasBit(s.mode, b.value)), ...SEND_FLAGS.filter(f => hasBit(s.mode, f.value))]
  const tolk = parts.length ? parts.map(p => p.tolk).join(' | ') : 'SEND_MODE_REGULAR'
  const core = parts.filter(p => p.tonCore).map(p => `SendMode.${p.tonCore}`)
  const coreMissing = parts.some(p => !p.tonCore)
  return {
    tolk,
    func: `send_raw_message(msg, ${s.mode});`,
    core: coreMissing ? `${s.mode} /* +16 has no SendMode member */` : core.length ? core.join(' | ') : 'SendMode.NONE'
  }
})

// ---------------------------------------------------------------- reserve mode
const resText = ref('4')
const resParsed = computed(() => {
  try {
    return { ok: true as const, mode: parseMode(resText.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const res = computed(() => (resParsed.value.ok ? explainReserveMode(resParsed.value.mode) : null))
function toggleRes(v: number, on: boolean) {
  const m = res.value?.mode ?? 0
  resText.value = String(on ? m | v : m & ~v)
}

const simAmount = ref('0.1')
const simAmountNano = ref<bigint | null>(null)
const simOriginal = ref('1')
const simOriginalNano = ref<bigint | null>(null)
const simRemaining = ref('1.5')
const simRemainingNano = ref<bigint | null>(null)
const sim = computed(() => {
  if (!res.value || simAmountNano.value === null || simOriginalNano.value === null || simRemainingNano.value === null) return null
  return simulateReserve({ mode: res.value.mode, amount: simAmountNano.value, originalBalance: simOriginalNano.value, remaining: simRemainingNano.value })
})
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="tab" :items="tabs" :content="false" class="w-full" />

    <!-- SEND -->
    <div v-if="tab === 'send'" class="space-y-5">
      <p class="text-sm text-muted">
        The mode passed to <code class="font-mono">send_raw_message</code> / <code class="font-mono">SENDRAWMSG</code> is one base (0, 64 or 128) plus any flags. Tick boxes or type a number (decimal, 0x…, or a sum like <code class="font-mono">128 + 32</code>).
      </p>

      <div class="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
        <UFormField label="Send mode" :error="sendParsed.ok ? undefined : sendParsed.error">
          <UInput v-model="sendText" size="xl" class="w-full" :ui="{ base: 'font-mono text-lg' }" inputmode="numeric" autocomplete="off" data-testid="send-mode-input" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-2 pb-1">
          <UBadge v-if="send" :color="send.valid ? 'success' : 'error'" variant="subtle" size="lg" :label="send.valid ? `Valid mode ${send.mode}` : 'Invalid mode'" />
          <span v-if="send" class="font-mono text-xs text-muted">binary {{ send.mode.toString(2).padStart(8, '0') }} · hex 0x{{ send.mode.toString(16) }}</span>
          <CopyButton v-if="send" :value="String(send.mode)" label="Copy" size="xs" />
        </div>
      </div>

      <fieldset class="space-y-2">
        <legend class="mb-2 text-sm font-medium text-highlighted">
          Base mode (pick one)
        </legend>
        <URadioGroup
          v-model="sendBase"
          :items="SEND_BASES.map(b => ({ label: `${b.value} · ${b.title}`, description: b.effect, value: String(b.value) }))"
          :ui="{ fieldset: 'gap-2' }"
        />
      </fieldset>

      <fieldset class="space-y-2">
        <legend class="mb-2 text-sm font-medium text-highlighted">
          Flags (add any)
        </legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <UCheckbox
            v-for="f in SEND_FLAGS"
            :key="f.value"
            :model-value="hasBit(send?.mode, f.value)"
            :label="`+${f.value} · ${f.title}`"
            :description="f.effect"
            @update:model-value="(v: boolean | 'indeterminate') => toggleFlag(f.value, v === true)"
          />
        </div>
      </fieldset>

      <USwitch v-model="external" label="This is an outbound external message (event/log), not an internal one" />

      <div v-if="send" class="space-y-2">
        <UAlert
          v-for="(n, i) in send.notes"
          :key="i"
          :color="NOTE_UI[n.severity].color"
          :icon="NOTE_UI[n.severity].icon"
          variant="subtle"
          :description="n.text"
        />
      </div>

      <KeyValue
        v-if="sendCode"
        :items="[
          { label: 'Tolk', value: sendCode.tolk },
          { label: 'FunC', value: sendCode.func },
          { label: '@ton/core', value: sendCode.core }
        ]"
      />

      <div>
        <h3 class="mb-2 font-display text-sm font-semibold text-highlighted">
          Common modes
        </h3>
        <ul class="divide-y divide-default rounded-lg border border-default">
          <li v-for="p in SEND_PRESETS" :key="p.mode">
            <button type="button" class="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-elevated sm:flex-row sm:items-baseline sm:gap-3" @click="sendText = String(p.mode)">
              <span class="w-32 shrink-0 font-mono text-sm text-highlighted">{{ p.label }}</span>
              <span class="text-sm text-muted">{{ p.use }}</span>
            </button>
          </li>
        </ul>
      </div>
      <p class="text-xs text-dimmed">
        Rules checked against the TON node source (crypto/block/transaction.cpp). 1024 (SEND_MODE_ESTIMATE_FEE_ONLY) is not an action mode: it only makes Tolk/FunC's SENDMSG return the fee without sending.
      </p>
    </div>

    <!-- RESERVE -->
    <div v-else class="space-y-5">
      <p class="text-sm text-muted">
        <code class="font-mono">raw_reserve(amount, mode)</code> / <code class="font-mono">RAWRESERVE</code> locks part of the balance so later actions (usually a mode 128 message) cannot spend it.
      </p>
      <div class="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
        <UFormField label="Reserve mode" :error="resParsed.ok ? undefined : resParsed.error">
          <UInput v-model="resText" size="xl" class="w-full" :ui="{ base: 'font-mono text-lg' }" inputmode="numeric" autocomplete="off" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-2 pb-1">
          <UBadge v-if="res" :color="res.valid ? 'success' : 'error'" variant="subtle" size="lg" :label="res.valid ? `Valid mode ${res.mode}` : 'Invalid mode'" />
          <CopyButton v-if="res" :value="String(res.mode)" label="Copy" size="xs" />
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <UCheckbox
          v-for="b in RESERVE_BITS"
          :key="b.value"
          :model-value="hasBit(res?.mode, b.value)"
          :label="`+${b.value} · ${b.title}`"
          :description="`${b.effect} (${b.tolk})`"
          class="min-w-0"
          :ui="{ description: '[overflow-wrap:anywhere]' }"
          @update:model-value="(v: boolean | 'indeterminate') => toggleRes(b.value, v === true)"
        />
      </div>
      <div v-if="res" class="space-y-2">
        <UAlert
          v-for="(n, i) in res.notes"
          :key="i"
          :color="NOTE_UI[n.severity].color"
          :icon="NOTE_UI[n.severity].icon"
          variant="subtle"
          :description="n.text"
        />
      </div>

      <div class="space-y-3 rounded-lg border border-default p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Try it on a balance
        </h3>
        <div class="grid gap-3 sm:grid-cols-3">
          <AmountInput v-model="simAmount" v-model:nano="simAmountNano" label="amount" />
          <AmountInput v-model="simOriginal" v-model:nano="simOriginalNano" label="Original balance" />
          <AmountInput v-model="simRemaining" v-model:nano="simRemainingNano" label="Remaining balance now" />
        </div>
        <p class="text-xs text-muted">
          Original = balance before the compute phase (without the incoming value). Remaining = what is left for the action phase at this point (after gas and earlier actions).
        </p>
        <div v-if="sim" data-testid="reserve-sim">
          <UAlert v-if="!sim.ok" color="error" variant="subtle" icon="i-lucide-circle-x" :title="`Action fails (result code ${sim.exitCode})`" :description="sim.error" />
          <KeyValue
            v-else
            :items="[
              { label: 'Reserved (locked)', value: formatCoin(sim.reserved!), copy: false },
              { label: 'Still spendable', value: formatCoin(sim.remaining!), copy: false, hint: 'What a following mode 128 message would carry' }
            ]"
          />
        </div>
      </div>

      <div>
        <h3 class="mb-2 font-display text-sm font-semibold text-highlighted">
          Common reserve modes
        </h3>
        <ul class="divide-y divide-default rounded-lg border border-default">
          <li v-for="p in RESERVE_PRESETS" :key="p.mode">
            <button type="button" class="flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-elevated sm:flex-row sm:items-baseline sm:gap-3" @click="resText = String(p.mode)">
              <span class="w-32 shrink-0 font-mono text-sm text-highlighted">{{ p.label }}</span>
              <span class="text-sm text-muted">{{ p.use }}</span>
            </button>
          </li>
        </ul>
      </div>
      <p class="text-xs text-dimmed">
        Since global version 10, RAWRESERVE cannot reserve extra currencies (RAWRESERVEX with a non-empty dictionary fails). Amounts are in {{ COIN_SYMBOL }} (formerly Toncoin).
      </p>
    </div>
  </div>
</template>
