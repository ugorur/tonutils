<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { WALLET_V4R2 } from './examples'
import { fromCodeData, fromStateInitBoc, splitStateInit } from './logic'

const mode = ref<'stateinit' | 'codedata'>('stateinit')
const workchain = ref(0)
const stateInit = ref('')
const code = ref('')
const data = ref('')
const { network } = useTonNetwork()

const empty = computed(() => mode.value === 'stateinit' ? !stateInit.value.trim() : !code.value.trim() && !data.value.trim())

const result = computed(() => {
  if (empty.value) return null
  try {
    return {
      ok: true as const,
      data: mode.value === 'stateinit' ? fromStateInitBoc(stateInit.value, workchain.value) : fromCodeData(code.value, data.value, workchain.value)
    }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function example() {
  if (mode.value === 'stateinit') {
    stateInit.value = WALLET_V4R2.boc
    return
  }
  const parts = splitStateInit(WALLET_V4R2.boc)
  code.value = parts.code
  data.value = parts.data
}

const test = computed(() => network.value === 'testnet')
const addressRows = computed<KeyValueItem[]>(() => {
  if (!result.value?.ok) return []
  const d = result.value.data
  return [
    { label: 'Bounceable (contracts)', value: test.value ? d.testnetBounceable : d.bounceable, hint: 'The usual form for a contract address.' },
    { label: 'Non-bounceable', value: test.value ? d.testnetNonBounceable : d.nonBounceable, hint: 'Use this to send the first funds to a contract that is not deployed yet: a bounceable transfer to an empty account bounces back.' },
    { label: 'Raw', value: d.raw }
  ]
})

const detailRows = computed<KeyValueItem[]>(() => {
  if (!result.value?.ok) return []
  const d = result.value.data
  const rows: KeyValueItem[] = [
    { label: 'StateInit hash (= account id)', value: d.stateInitHash },
    { label: 'Code hash', value: d.codeHash ?? '' },
    { label: 'Data hash', value: d.dataHash ?? '' }
  ]
  if (d.splitDepth !== null) rows.push({ label: 'split_depth', value: String(d.splitDepth), copy: false })
  if (d.special) rows.push({ label: 'special (tick / tock)', value: `${d.special.tick} / ${d.special.tock}`, copy: false })
  if (d.libraries) rows.push({ label: 'Libraries', value: String(d.libraries), copy: false })
  return rows
})
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'StateInit BOC', value: 'stateinit', icon: 'i-lucide-package' }, { label: 'Code + data', value: 'codedata', icon: 'i-lucide-file-code-2' }]"
      class="w-full"
    />

    <div class="space-y-4">
      <UFormField v-if="mode === 'stateinit'" label="StateInit BOC" hint="base64 or hex">
        <UTextarea v-model="stateInit" :rows="4" autoresize :maxrows="10" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc… (the state_init of a deploy message)" spellcheck="false" />
      </UFormField>
      <template v-else>
        <UFormField label="Code BOC" hint="base64, hex or Blueprint build JSON">
          <UTextarea v-model="code" :rows="3" autoresize :maxrows="8" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc… or b5ee9c72… or the contents of build/*.compiled.json" spellcheck="false" />
        </UFormField>
        <UFormField label="Initial data BOC" hint="empty = empty cell">
          <UTextarea v-model="data" :rows="3" autoresize :maxrows="8" class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cc… the contract's initial storage" spellcheck="false" />
        </UFormField>
      </template>

      <div class="flex flex-wrap items-end justify-between gap-3">
        <UFormField label="Workchain">
          <USelect v-model="workchain" :items="[{ label: '0 · basechain', value: 0 }, { label: '-1 · masterchain', value: -1 }]" class="w-44" />
        </UFormField>
        <UButton v-if="empty" label="Try an example (wallet v4r2 deploy)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
    </div>

    <UAlert v-if="result && !result.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="result.error" />

    <template v-if="result?.ok">
      <div>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Contract address <span class="font-sans text-xs font-normal text-muted">({{ network }})</span>
          </h3>
          <ExplorerLinks :value="test ? result.data.testnetBounceable : result.data.bounceable" />
        </div>
        <KeyValue :items="addressRows" class="mt-1" />
      </div>
      <div>
        <h3 class="font-display text-sm font-semibold text-highlighted">
          StateInit
        </h3>
        <KeyValue :items="detailRows" class="mt-1" />
        <ResultField label="StateInit BOC (base64)" :value="result.data.stateInitBoc" hint="Attach this as state_init (stateInit in TonConnect) to the first message to deploy the contract.">
          <div class="max-h-32 overflow-y-auto">
            {{ result.data.stateInitBoc }}
          </div>
        </ResultField>
      </div>
    </template>

    <p class="text-xs text-dimmed">
      A TON contract address is the hash of its StateInit (code + initial data), so you can know it before deploying. The same code and data always give the same address; changing one bit of the data gives a new one.
    </p>
  </div>
</template>
