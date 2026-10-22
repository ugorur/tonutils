<script setup lang="ts">
import type { TonConnectMessage } from '~/composables/useTonConnect'
import type { DecodedBody, DecodedValue } from '~/utils/ton/messages'
import { decodeBody } from '~/utils/ton/messages'

// What the wallet will be asked to sign, decoded. Mandatory in every wallet tool before sendTransaction.
// Client-only (imports @ton/core through messages.ts).
const props = defineProps<{ messages: TonConnectMessage[] }>()

const { isTestnet } = useTonNetwork()
/** Fields holding nanoGRAM (the rest of the amounts are jetton units with unknown decimals). */
const COIN_FIELDS = new Set(['forward_ton_amount', 'forward_amount', 'ton_amount'])

interface Row { label: string, value: string, coin?: bigint }

function rows(body: DecodedBody, prefix = ''): Row[] {
  return Object.entries(body.fields).flatMap(([k, v]: [string, DecodedValue]) => {
    const label = prefix + k.replace(/_/g, ' ')
    if (v && typeof v === 'object') return [{ label, value: v.title }, ...rows(v, `${label} › `)]
    if (typeof v === 'bigint' && COIN_FIELDS.has(k)) return [{ label, value: '', coin: v }]
    if (k === 'amount' && typeof v === 'bigint') return [{ label: `${label} (token base units)`, value: v.toString() }]
    return [{ label, value: v === null ? '—' : String(v) }]
  })
}

const items = computed(() => props.messages.map((m) => {
  const body = m.payload === undefined ? null : decodeBody(m.payload, { testOnly: isTestnet.value })
  let amount: bigint | null = null
  try {
    amount = BigInt(m.amount)
  }
  catch { /* shown as invalid */ }
  return { m, amount, body, rows: body ? rows(body) : [], deploys: m.stateInit !== undefined }
}))

const total = computed(() => items.value.reduce((s, i) => s + (i.amount ?? 0n), 0n))
const unknown = computed(() => items.value.some(i => i.body && (i.body.name === 'unknown' || i.body.error)))
</script>

<template>
  <section class="space-y-3" aria-labelledby="txpreview-h" data-testid="tx-preview">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="txpreview-h" class="font-display text-sm font-semibold text-highlighted">
        Your wallet will be asked to sign
      </h3>
      <span class="text-sm text-muted">{{ messages.length }} message{{ messages.length === 1 ? '' : 's' }} · total <TokenAmount :nano="total" /> + network fees</span>
    </div>

    <ol class="space-y-3">
      <li v-for="(it, i) in items" :key="i" class="rounded-lg border border-default p-4">
        <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
          <div class="min-w-0">
            <div class="text-xs text-muted">
              To
            </div>
            <AddressLink :address="it.m.address" />
          </div>
          <div class="sm:text-right">
            <div class="text-xs text-muted">
              Amount
            </div>
            <TokenAmount v-if="it.amount !== null" :nano="it.amount" class="text-base" />
            <span v-else class="text-error">Invalid amount</span>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <UBadge v-if="it.body" :color="it.body.name === 'unknown' || it.body.error ? 'warning' : 'primary'" variant="subtle" :label="it.body.opHex ? `${it.body.title} · ${it.body.opHex}` : it.body.title" />
          <UBadge v-else color="neutral" variant="subtle" label="No body (plain transfer)" />
          <UBadge v-if="it.deploys" color="warning" variant="subtle" icon="i-lucide-package-plus" label="Deploys a contract (StateInit attached)" />
        </div>

        <dl v-if="it.rows.length" class="mt-3 grid gap-x-4 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr] sm:gap-y-1.5">
          <template v-for="r in it.rows" :key="r.label">
            <dt class="mt-2 text-xs text-muted first-letter:uppercase sm:mt-0 sm:text-sm">
              {{ r.label }}
            </dt>
            <dd class="min-w-0 font-mono break-all text-highlighted">
              <TokenAmount v-if="r.coin !== undefined" :nano="r.coin" />
              <template v-else>
                {{ r.value }}
              </template>
            </dd>
          </template>
        </dl>
        <p v-if="it.body?.error" class="mt-2 text-xs text-warning">
          {{ it.body.error }}
        </p>
      </li>
    </ol>

    <UAlert
      v-if="unknown"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Part of this transaction could not be decoded"
      description="Only continue if you trust where this request came from."
    />
  </section>
</template>
