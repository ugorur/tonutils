<script setup lang="ts">
import type { ContractMethods } from './logic'
import { contractMethods, describeIds, isHashedId, KNOWN_GETTERS, lookupId, methodIds, parseMethodIdInput, signed19 } from './logic'

// USD₮ jetton master on mainnet: standard FunC dispatcher with get_jetton_data, get_wallet_address, get_next_admin_address.
const EXAMPLE_CONTRACT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'

const tab = ref('name')
const names = ref('')
const idInput = ref('')
const address = ref('')
const addressOk = ref(false)

const rows = computed(() => methodIds(names.value))
const single = computed(() => rows.value.length === 1 && !('error' in rows.value[0]!) ? rows.value[0] as Exclude<typeof rows.value[number], { error: string }> : null)

const reverse = computed(() => {
  if (!idInput.value.trim()) return null
  const parsed = parseMethodIdInput(idInput.value)
  if (parsed === null) return { error: 'Enter a decimal (85143) or hex (0x14c97) number.' }
  const id = signed19(parsed)
  return { id, unsigned: id !== parsed ? parsed : null, row: describeIds([id])[0]!, matches: lookupId(id) }
})

const tc = useToncenter()
const busy = ref(false)
const error = ref<unknown>(null)
const contract = ref<ContractMethods | null>(null)
const inspected = ref('')

async function inspect() {
  if (!addressOk.value) return
  busy.value = true
  error.value = null
  contract.value = null
  try {
    inspected.value = address.value.trim()
    contract.value = await contractMethods(inspected.value, tc)
  }
  catch (e) {
    error.value = e
  }
  finally {
    busy.value = false
  }
}

function tryExample() {
  address.value = EXAMPLE_CONTRACT
  addressOk.value = true
  inspect()
}

const KIND = {
  getter: { label: 'get-method', color: 'primary' },
  entry: { label: 'entry point', color: 'neutral' },
  procedure: { label: 'internal function', color: 'neutral' }
} as const

const nameColumns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'id', header: 'method_id' }
]
const contractColumns = [
  { accessorKey: 'id', header: 'method_id' },
  { accessorKey: 'names', header: 'Known name' }
]
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="tab"
      :content="false"
      :items="[
        { label: 'Name', value: 'name', icon: 'i-lucide-arrow-right' },
        { label: 'ID', value: 'id', icon: 'i-lucide-arrow-left' },
        { label: 'Contract', value: 'contract', icon: 'i-lucide-file-code-2' }
      ]"
      class="w-full"
    />

    <!-- name → id -->
    <div v-if="tab === 'name'" class="space-y-4">
      <UFormField label="Get-method name" hint="One per line for several">
        <UTextarea
          v-model="names"
          :rows="2"
          autoresize
          :maxrows="12"
          class="w-full"
          :ui="{ base: 'font-mono text-sm' }"
          placeholder="seqno"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
        />
      </UFormField>
      <div v-if="!names" class="flex flex-wrap gap-x-4">
        <UButton label="Try seqno" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="names = 'seqno'" />
        <UButton label="Try the jetton getters" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="names = 'get_jetton_data\nget_wallet_address\nget_wallet_data'" />
      </div>

      <template v-if="single">
        <div class="grid gap-x-6 sm:grid-cols-2">
          <ResultField label="method_id (decimal)" :value="String(single.id)" />
          <ResultField label="method_id (hex)" :value="single.hex" />
        </div>
        <p class="text-sm text-muted">
          <template v-if="single.reserved">
            <code class="font-mono">{{ single.name }}</code> is a reserved entry point: {{ single.reserved.toLowerCase() }}. The compiler gives it this fixed id instead of a hash.
          </template>
          <template v-else>
            Use this number with <code class="font-mono">runGetMethod</code> APIs that take an id, or to find the method in disassembled code
            (<code class="font-mono">{{ single.id }} DECLMETHOD {{ single.name }}</code>). FunC <code class="font-mono">method_id</code>, Tolk <code class="font-mono">get fun</code> and Tact getters all compute it the same way.
          </template>
        </p>
      </template>

      <UTable v-else-if="rows.length > 1" :data="rows" :columns="nameColumns" :ui="{ td: 'py-2 px-2 whitespace-normal', th: 'py-2 px-2' }">
        <template #name-cell="{ row }">
          <span class="font-mono text-xs break-all">{{ row.original.name }}</span>
        </template>
        <template #id-cell="{ row }">
          <span v-if="'error' in row.original" class="text-xs text-error">{{ row.original.error }}</span>
          <span v-else class="flex items-center gap-1 font-mono text-xs">{{ row.original.id }} <span class="text-dimmed">({{ row.original.hex }})</span><CopyButton :value="String(row.original.id)" size="xs" /></span>
        </template>
      </UTable>
      <UAlert v-else-if="rows.length === 1" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="(rows[0] as { error: string }).error" />

      <p class="text-xs text-dimmed">
        method_id = (crc16(name) &amp; 0xffff) | 0x10000, where crc16 is CRC-16/XMODEM of the UTF-8 name. Names are case-sensitive.
      </p>
    </div>

    <!-- id → name -->
    <div v-else-if="tab === 'id'" class="space-y-4">
      <UFormField label="method_id" hint="Decimal or 0x hex">
        <UInput v-model="idInput" class="w-full" size="lg" :ui="{ base: 'font-mono' }" placeholder="85143" inputmode="text" autocomplete="off" />
      </UFormField>
      <UButton v-if="!idInput" label="Try 106029" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="idInput = '106029'" />

      <UAlert v-if="reverse && 'error' in reverse" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="reverse.error" />
      <template v-else-if="reverse">
        <div v-if="reverse.matches.length" class="divide-y divide-default">
          <ResultField v-for="m in reverse.matches" :key="m.name" :label="m.where" :value="m.name" />
        </div>
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-search-x"
          title="Not one of the common getters we know"
          :description="isHashedId(reverse.id)
            ? `${reverse.id} is a valid hashed id, but crc16 is one-way: we can only match it against ${KNOWN_GETTERS.length} known names. Compute your candidate names in the Name tab.`
            : `Hashed get-method ids are always between 65536 and 131071. ${reverse.id} looks like a FunC internal function id or a custom method_id(…).`"
        />
        <p class="text-xs text-dimmed">
          Kind: {{ KIND[reverse.row.kind].label }} · hex {{ reverse.row.hex }}
          <template v-if="reverse.unsigned !== null">
            · {{ reverse.unsigned }} is the unsigned 19-bit form of {{ reverse.id }} (toncenter lists ids this way)
          </template>
        </p>
      </template>
    </div>

    <!-- contract -->
    <div v-else class="space-y-4">
      <AddressInput v-model="address" label="Contract address" @parsed="a => addressOk = !!a" />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton label="List methods" icon="i-lucide-list" :loading="busy" :disabled="!addressOk" @click="inspect" />
        <UButton v-if="!address" label="Try the USD₮ master" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </div>

      <LoadingState v-if="busy" label="Reading the contract code from toncenter…" />
      <ErrorNotice :error="error" @retry="inspect" />

      <template v-if="contract">
        <div class="flex flex-wrap gap-2">
          <UBadge v-for="i in contract.interfaces" :key="i" variant="subtle" color="neutral" :label="i" />
          <UBadge variant="outline" color="neutral" :label="contract.source === 'toncenter' ? 'ids from toncenter' : contract.source === 'library' ? 'read from library code' : 'read from code'" />
        </div>
        <UTable v-if="contract.rows" :data="contract.rows" :columns="contractColumns" :ui="{ td: 'py-2', th: 'py-2' }">
          <template #id-cell="{ row }">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-mono text-xs">{{ row.original.id }} <span class="text-dimmed">({{ row.original.hex }})</span></span>
              <UBadge size="sm" variant="subtle" :color="KIND[row.original.kind].color" :label="KIND[row.original.kind].label" />
            </div>
          </template>
          <template #names-cell="{ row }">
            <span class="font-mono text-xs break-all whitespace-normal">{{ row.original.names || (row.original.kind === 'getter' ? 'unknown' : '') }}</span>
          </template>
        </UTable>
        <UAlert
          v-else
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          title="No method dictionary in this code"
          description="The contract uses a hand-written dispatcher (wallets v1–v3 do this), so its get-methods cannot be listed from the code. Disassemble the code and look for PUSHINT comparisons instead."
        />
        <ExplorerLinks kind="address" :value="inspected" />
      </template>
    </div>
  </div>
</template>
