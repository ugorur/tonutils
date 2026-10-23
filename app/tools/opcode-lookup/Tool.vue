<script setup lang="ts">
import { parseOp } from '~/utils/ton/opcodes'
import { GROUP_LABELS, decodedName, opForms, searchOpcodes } from './logic'
import type { LookupGroup } from './logic'

// Deep link: /tools/opcode-lookup?q=0x0f8a7ea5
const initial = useRoute().query.q
const query = ref(typeof initial === 'string' ? initial : '')
const group = ref<LookupGroup | 'all'>('all')
const groups = [{ label: 'All', value: 'all' }, ...Object.entries(GROUP_LABELS).map(([value, label]) => ({ label, value }))]
const examples = ['0x0f8a7ea5', '0x5fcc3d14', '0xd53276db', '0x7369676e', 'excesses']

const results = computed(() => searchOpcodes(query.value, group.value === 'all' ? undefined : group.value))
const parsed = computed(() => parseOp(query.value))
const exactHit = computed(() => parsed.value !== null && results.value[0]?.op === parsed.value)

// Fallback: toncenter's indexer knows op codes from many more contract ABIs. Only called on click.
const tc = useToncenter()
const remote = ref<{ op: number, name: string | null } | null>(null)
const remoteLoading = ref(false)
const remoteError = ref<unknown>(null)
watch(query, () => {
  remote.value = null
  remoteError.value = null
})

async function askToncenter() {
  const op = parsed.value
  if (op === null) return
  remoteLoading.value = true
  remoteError.value = null
  try {
    const res = await tc.v3<{ opcodes: string[] }>('decode', { opcodes: opForms(op).hex })
    remote.value = { op, name: decodedName(res) }
  }
  catch (e) {
    remoteError.value = e
  }
  finally {
    remoteLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <UFormField label="Op code or name" hint="0x hex, decimal (signed or unsigned) or words">
      <UInput
        v-model="query"
        size="xl"
        class="w-full"
        icon="i-lucide-search"
        placeholder="e.g. 0x0f8a7ea5, -718113061, nft transfer"
        autocomplete="off"
        :ui="{ base: 'font-mono' }"
        aria-label="Op code or name"
      />
    </UFormField>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted">Try:</span>
      <UButton v-for="e in examples" :key="e" :label="e" size="xs" color="neutral" variant="outline" class="font-mono" @click="query = e" />
    </div>

    <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filter by standard">
      <UButton
        v-for="g in groups"
        :key="g.value"
        :label="g.label"
        size="xs"
        :color="group === g.value ? 'primary' : 'neutral'"
        :variant="group === g.value ? 'solid' : 'ghost'"
        role="radio"
        :aria-checked="group === g.value"
        @click="group = g.value as LookupGroup | 'all'"
      />
    </div>

    <div v-if="parsed !== null && !exactHit" class="space-y-3 rounded-lg border border-dashed border-default p-4">
      <p class="text-sm">
        <span class="font-mono text-highlighted">{{ opForms(parsed).hex }}</span> is not in our table.
        <span class="text-muted">toncenter's decoder knows op codes from more contracts.</span>
      </p>
      <UButton label="Ask toncenter" icon="i-lucide-radio-tower" size="sm" :loading="remoteLoading" @click="askToncenter" />
      <ErrorNotice v-if="remoteError" :error="remoteError" @retry="askToncenter" />
      <p v-if="remote" class="text-sm" aria-live="polite">
        <template v-if="remote.name">
          toncenter calls it <span class="font-mono font-semibold text-highlighted">{{ remote.name }}</span>.
        </template>
        <template v-else>
          toncenter does not know it either. It may be a private op code; if you have the TL-B constructor, compute its CRC32 with the
          <ULink to="/tools/tlb-opcode-crc32" class="text-primary">TL-B op code calculator</ULink>.
        </template>
      </p>
    </div>

    <p class="text-sm text-muted" aria-live="polite">
      {{ results.length }} {{ results.length === 1 ? 'op code' : 'op codes' }}
    </p>

    <ul v-if="results.length" class="space-y-3">
      <li v-for="e in results" :key="e.op" class="rounded-lg border border-default p-4" :class="parsed === e.op ? 'border-primary' : ''">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="font-mono text-lg font-semibold text-highlighted">{{ opForms(e.op).hex }}</span>
          <CopyButton :value="opForms(e.op).hex" size="xs" />
          <UBadge color="neutral" variant="subtle" size="sm" :label="GROUP_LABELS[e.group]" class="ms-auto" />
        </div>
        <p class="mt-1 font-medium text-highlighted">
          {{ e.title }}
        </p>
        <dl class="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
          <dt class="text-muted">
            Name
          </dt>
          <dd class="font-mono break-all">
            {{ e.name }}
          </dd>
          <dt class="text-muted">
            Decimal
          </dt>
          <dd class="font-mono">
            {{ opForms(e.op).unsigned }}<template v-if="opForms(e.op).signed !== opForms(e.op).unsigned">
              · signed {{ opForms(e.op).signed }}
            </template>
          </dd>
          <dt class="text-muted">
            Defined in
          </dt>
          <dd>{{ e.source }}</dd>
        </dl>
        <div v-if="e.tlb" class="mt-3 flex items-start gap-2 rounded-md bg-elevated p-2">
          <code class="min-w-0 flex-1 text-xs break-all whitespace-pre-wrap">{{ e.tlb }}</code>
          <CopyButton :value="e.tlb" size="xs" />
        </div>
      </li>
    </ul>

    <p class="text-xs text-dimmed">
      An op code is the first 32 bits of a message body. Paste a whole body into the
      <ULink to="/tools/payload-decoder" class="text-primary">payload decoder</ULink> to decode all of its fields.
    </p>
  </div>
</template>
