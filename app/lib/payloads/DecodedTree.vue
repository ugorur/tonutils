<script setup lang="ts">
// Recursive view of a DecodedBody (from ~/lib/payloads/decode). Client-only: AddressLink imports @ton/core.
import type { DecodedBody, DecodedValue } from './decode'

defineOptions({ name: 'DecodedTree' })
const props = defineProps<{ body: DecodedBody, depth?: number }>()

/** bigint fields that hold nanoGRAM; `amount` alone is jetton base units. */
const COIN_FIELDS = new Set(['value', 'forward_ton_amount', 'forward_amount', 'ton_amount'])
const FRIENDLY = /^[EUk0][Qf][\w-]{46}$/

type Row
  = | { key: string, label: string, kind: 'node', node: DecodedBody }
    | { key: string, label: string, kind: 'coin', nano: bigint }
    | { key: string, label: string, kind: 'address', text: string }
    | { key: string, label: string, kind: 'boc' | 'text' | 'mono', text: string }

function row(key: string, v: DecodedValue): Row {
  const label = key.replace(/_/g, ' ')
  if (v && typeof v === 'object') return { key, label, kind: 'node', node: v }
  if (typeof v === 'bigint' && COIN_FIELDS.has(key)) return { key, label, kind: 'coin', nano: v }
  if (typeof v === 'bigint' && key === 'amount') return { key, label: `${label} (token base units)`, kind: 'mono', text: v.toString() }
  if (typeof v === 'boolean') return { key, label, kind: 'text', text: v ? 'yes' : 'no' }
  if (v === null) return { key, label, kind: 'text', text: '—' }
  const text = String(v)
  if (FRIENDLY.test(text)) return { key, label, kind: 'address', text }
  if (text.startsWith('te6cc')) return { key, label, kind: 'boc', text }
  return { key, label, kind: key === 'text' || key === 'mode' || key.startsWith('original') ? 'text' : 'mono', text }
}

const rows = computed(() => Object.entries(props.body.fields).map(([k, v]) => row(k, v)))
const warn = computed(() => props.body.name === 'unknown' || props.body.name === 'invalid' || !!props.body.error)
</script>

<template>
  <div class="min-w-0 space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <UBadge :color="warn ? 'warning' : 'primary'" variant="subtle" :label="body.title" />
      <code v-if="body.opHex" class="font-mono text-xs text-muted">op {{ body.opHex }}</code>
      <code v-if="body.info?.source" class="text-xs text-dimmed">{{ body.info.source }}</code>
    </div>
    <p v-if="body.error" class="text-xs text-warning">
      {{ body.error }}
    </p>
    <dl v-if="rows.length" class="grid gap-x-4 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr] sm:gap-y-2">
      <template v-for="r in rows" :key="r.key">
        <dt class="mt-2 text-xs text-muted first-letter:uppercase sm:mt-0.5">
          {{ r.label }}
        </dt>
        <dd class="min-w-0 text-highlighted">
          <div v-if="r.kind === 'node'" class="mt-1 rounded-lg border border-default bg-elevated/40 p-3 sm:mt-0">
            <DecodedTree :body="r.node" :depth="(depth ?? 0) + 1" />
          </div>
          <span v-else-if="r.kind === 'coin'" class="font-mono">
            <TokenAmount :nano="r.nano" /> <span class="text-xs text-dimmed">({{ r.nano }} {{ NANO_NAME }})</span>
          </span>
          <AddressLink v-else-if="r.kind === 'address'" :address="r.text" />
          <div v-else-if="r.kind === 'boc'" class="flex items-start gap-1">
            <code class="line-clamp-3 min-w-0 flex-1 font-mono text-xs break-all text-muted">{{ r.text }}</code>
            <CopyButton :value="r.text" size="xs" />
          </div>
          <span v-else :class="r.kind === 'mono' ? 'font-mono break-all' : 'break-words'">{{ r.text }}</span>
        </dd>
      </template>
    </dl>
  </div>
</template>
