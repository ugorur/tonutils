<script setup lang="ts">
import { opHex } from '~/utils/ton/opcodes'
import { constants, schemaTags } from './logic'

// TEP-74 jetton transfer written without its tag, the way you would while designing a new message.
const EXAMPLE = 'transfer query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;'
const EXAMPLE_SCHEMA = `// TEP-74 jetton messages, with their published tags
transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;
transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress forward_payload:(Either Cell ^Cell) = InternalMsgBody;
excesses#d53276db query_id:uint64 = InternalMsgBody;
burn#595f07bc query_id:uint64 amount:(VarUInteger 16) response_destination:MsgAddress custom_payload:(Maybe ^Cell) = InternalMsgBody;
internal_transfer#178d4519 query_id:uint64 amount:(VarUInteger 16) from:MsgAddress response_address:MsgAddress forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;`

const input = ref('')
const variant = ref<'explicit' | 'masked' | 'crc'>('masked')

const results = computed(() => input.value.trim() ? schemaTags(input.value) : [])
const single = computed(() => results.value.length === 1 ? results.value[0]! : null)
const tag = computed(() => single.value && 'tag' in single.value ? single.value.tag : null)
// an explicit 32-bit #tag is the real op: default the constants to it, not to a crc32 variant
watch(() => tag.value?.explicitValue ?? null, (v) => {
  variant.value = v !== null ? 'explicit' : variant.value === 'explicit' ? 'masked' : variant.value
}, { immediate: true })
const variantItems = computed(() => [
  ...(tag.value?.explicitValue != null ? [{ label: 'Explicit tag', value: 'explicit' }] : []),
  { label: 'Top bit cleared', value: 'masked' },
  { label: 'Raw crc32', value: 'crc' }
])
const code = computed(() => {
  const t = tag.value
  if (!t) return null
  const op = variant.value === 'explicit' ? t.explicitValue : t[variant.value]
  return op === null ? null : constants(t.name, op)
})

const MATCH_LABEL = { crc: 'the raw crc32', masked: 'crc32 with the top bit cleared', topBit: 'crc32 with the top bit set' } as const

const columns = [
  { accessorKey: 'name', header: 'Constructor' },
  { accessorKey: 'crc', header: 'crc32 · & 0x7fffffff' },
  { accessorKey: 'explicit', header: 'Explicit tag' }
]
const rows = computed(() => results.value.map(r => 'tag' in r
  ? { name: r.tag.name, crc: opHex(r.tag.crc), masked: opHex(r.tag.masked), explicit: r.tag.explicit ?? '', matches: r.tag.explicitMatches, explicitValue: r.tag.explicitValue, error: '' }
  : { name: r.source.split(/\s/)[0] ?? '', crc: '', masked: '', explicit: '', matches: [], explicitValue: null, error: r.error }))
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-2">
      <UFormField label="TL-B constructor" hint="One line, or a whole schema (split on ;)">
        <UTextarea
          v-model="input"
          :rows="3"
          autoresize
          :maxrows="14"
          class="w-full"
          :ui="{ base: 'font-mono text-xs' }"
          placeholder="transfer query_id:uint64 amount:(VarUInteger 16) … = InternalMsgBody;"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <UButton label="Try the jetton transfer" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = EXAMPLE" />
        <UButton label="Try the TEP-74 schema" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = EXAMPLE_SCHEMA" />
        <UButton v-if="input" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="input = ''" />
      </div>
    </div>

    <UAlert v-if="single && 'error' in single" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="single.error" />

    <template v-if="tag">
      <ResultField label="Normalized text that is hashed" :value="tag.normalized" hint="Tag, parentheses, braces and ';' removed, spaces collapsed (tlbc canonical form)." />
      <div class="grid gap-x-6 sm:grid-cols-3">
        <ResultField label="crc32 (implicit TL-B tag)" :value="opHex(tag.crc)" hint="What tlbc assigns a named constructor without a tag." />
        <ResultField label="Top bit cleared (& 0x7fffffff)" :value="opHex(tag.masked)" hint="TEP-74 style op, e.g. 0x0f8a7ea5." />
        <ResultField label="Top bit set (| 0x80000000)" :value="opHex(tag.topBit)" hint="Some TEPs use this, e.g. excesses 0xd53276db." />
      </div>

      <UAlert
        v-if="tag.explicit && tag.explicitValue !== null"
        :color="tag.explicitMatches.length ? 'success' : 'warning'"
        variant="subtle"
        :icon="tag.explicitMatches.length ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
        :title="tag.explicitMatches.length ? `Explicit tag ${tag.explicit} equals ${MATCH_LABEL[tag.explicitMatches[0]!]}` : `Explicit tag ${tag.explicit} is not derived from this text`"
        :description="tag.explicitMatches.length ? undefined : 'That is allowed (any 32-bit tag works), but if you meant to derive it, check field names and types: every character counts.'"
      />
      <p v-else-if="tag.explicit" class="text-sm text-muted">
        Explicit tag <code class="font-mono">{{ tag.explicit }}</code> is not 32 bits, so it is not a crc32 op code.
      </p>

      <UAlert
        v-for="k in tag.known"
        :key="k.info.op"
        color="info"
        variant="subtle"
        icon="i-lucide-book-open"
        :title="`${opHex(k.info.op)} is the known op “${k.info.title}”`"
        :description="`${k.info.name} · ${k.info.source}`"
      />

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-sm font-medium text-highlighted">
            Constants
          </h3>
          <UTabs
            v-model="variant"
            :content="false"
            size="xs"
            :items="variantItems"
          />
        </div>
        <div v-if="code" class="divide-y divide-default">
          <ResultField label="Tolk" :value="code.tolk" />
          <ResultField label="FunC" :value="code.func" />
          <ResultField label="Tact" :value="code.tact" />
        </div>
      </div>
    </template>

    <UTable v-else-if="results.length > 1" :data="rows" :columns="columns" :ui="{ td: 'py-2 px-2 align-top whitespace-normal', th: 'py-2 px-2' }">
      <template #name-cell="{ row }">
        <span class="font-mono text-xs break-all">{{ row.original.name }}</span>
        <div v-if="row.original.error" class="text-xs text-error whitespace-normal">
          {{ row.original.error }}
        </div>
      </template>
      <template #crc-cell="{ row }">
        <div class="font-mono text-xs">
          {{ row.original.crc }}
        </div>
        <div class="font-mono text-xs text-muted">
          {{ row.original.masked }}
        </div>
      </template>
      <template #explicit-cell="{ row }">
        <div class="font-mono text-xs">
          {{ row.original.explicit }}
        </div>
        <UBadge v-if="row.original.explicitValue !== null" size="sm" variant="subtle" :color="row.original.matches.length ? 'success' : 'warning'" :label="row.original.matches.length ? (row.original.matches[0] === 'crc' ? 'raw' : row.original.matches[0] === 'masked' ? 'top bit cleared' : 'top bit set') : 'not derived'" />
      </template>
    </UTable>

    <p class="text-xs text-dimmed">
      TL-B gives a named constructor without a tag the CRC-32 (zlib/IEEE) of its normalized text. TEP-74 then clears the top bit for its op codes;
      other TEPs use the raw value or set the top bit, so we show all three. Exotic syntax that tlbc rewrites (such as <code class="font-mono">{a &lt;= b}</code> constraints) may hash differently.
    </p>
  </div>
</template>
