<script setup lang="ts">
import { bodyRows, type MsgView } from './txview'

// One message of a transaction: direction, parties, value, flags and the decoded body.
const props = defineProps<{ msg: MsgView, title: string }>()

const rows = computed(() => (props.msg.decoded ? bodyRows(props.msg.decoded) : []))
const kindLabel = computed(() => ({ 'internal': 'Internal', 'external-in': 'External in', 'external-out': 'External out (log / event)' })[props.msg.kind])
const showBody = ref(false)
// Wallet external messages (v3/v4, highload…) start with a 512-bit signature, so their first 32 bits are not an op code
// (a zero signature even reads as a text comment). Only W5 puts a real op (0x7369676e) first.
const signedExternal = computed(() => props.msg.kind === 'external-in' && props.msg.decoded?.name !== 'w5_external_signed')
</script>

<template>
  <div class="rounded-lg border border-default p-3 sm:p-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm font-medium text-highlighted">{{ title }}</span>
      <UBadge color="neutral" variant="subtle" size="sm" :label="kindLabel" />
      <UBadge v-if="msg.bounced" color="warning" variant="subtle" size="sm" icon="i-lucide-undo-2" label="Bounced back" />
      <UBadge v-else-if="msg.bounce" color="neutral" variant="outline" size="sm" label="Bounceable" />
      <UBadge v-if="msg.hasInit" color="warning" variant="subtle" size="sm" icon="i-lucide-package-plus" label="Carries StateInit (deploy)" />
    </div>

    <dl class="mt-2 grid gap-x-4 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr] sm:gap-y-1.5">
      <template v-if="msg.src">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          From
        </dt>
        <dd class="min-w-0">
          <AddressLink :address="msg.src" />
        </dd>
      </template>
      <template v-if="msg.dest">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          To
        </dt>
        <dd class="min-w-0">
          <AddressLink :address="msg.dest" />
        </dd>
      </template>
      <template v-if="msg.value !== null">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          Value
        </dt>
        <dd><TokenAmount :nano="msg.value" /></dd>
      </template>
      <template v-if="msg.fwdFee !== null">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          Forward fee
        </dt>
        <dd><TokenAmount :nano="msg.fwdFee" /></dd>
      </template>
      <template v-if="msg.importFee">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          Import fee
        </dt>
        <dd><TokenAmount :nano="msg.importFee" /></dd>
      </template>
      <template v-if="msg.createdLt !== null">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          Created lt
        </dt>
        <dd class="font-mono">
          {{ msg.createdLt }}
        </dd>
      </template>
      <template v-if="msg.hash">
        <dt class="mt-2 text-xs text-muted sm:mt-0 sm:text-sm">
          Message hash
        </dt>
        <dd class="flex min-w-0 items-start gap-1">
          <span class="font-mono text-xs break-all">{{ msg.hash }}</span>
          <CopyButton :value="msg.hash" size="xs" />
        </dd>
      </template>
    </dl>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <UBadge v-if="msg.bounced && msg.body" color="warning" variant="subtle" icon="i-lucide-undo-2" label="Bounced: 0xffffffff + original body" />
      <UBadge v-else-if="signedExternal && msg.body" color="neutral" variant="subtle" icon="i-lucide-pen-line" label="Signed wallet request" title="Signature + wallet-specific payload; not an op code" />
      <UBadge
        v-else-if="msg.decoded"
        :color="msg.decoded.name === 'unknown' || msg.decoded.error ? 'warning' : 'primary'"
        variant="subtle"
        :label="msg.decoded.opHex ? `${msg.decoded.title} · ${msg.decoded.opHex}` : msg.decoded.title"
      />
      <UBadge v-else color="neutral" variant="subtle" label="Empty body" />
      <UButton
        v-if="msg.body"
        size="xs"
        color="neutral"
        variant="ghost"
        :icon="showBody ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        :label="showBody ? 'Hide body BOC' : 'Body BOC'"
        @click="showBody = !showBody"
      />
    </div>

    <dl v-if="rows.length && !signedExternal && !msg.bounced" class="mt-2 grid gap-x-4 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr] sm:gap-y-1.5">
      <template v-for="r in rows" :key="r.label">
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
    <p v-if="msg.decoded?.error && !signedExternal && !msg.bounced" class="mt-2 text-xs text-warning">
      {{ msg.decoded.error }}
    </p>
    <ResultField v-if="showBody && msg.body" label="Body (base64 BOC)" :value="msg.body" class="mt-1" />
  </div>
</template>
