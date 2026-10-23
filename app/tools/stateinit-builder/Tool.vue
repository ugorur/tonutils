<script setup lang="ts">
import type { KeyValueItem } from '~/components/KeyValue.vue'
import type { DroppedFile } from '~/components/FileDrop.vue'
import { Cell, loadStateInit } from '@ton/core'
import { HMSTR_JETTON_WALLET_DEPLOY, WALLET_V4R2_DEPLOY } from './examples'
import type { StateInitInfo } from './logic'
import { buildStateInit, decodeStateInit, tonConnectMessage } from './logic'

const { isTestnet } = useTonNetwork()
const mode = ref<'decode' | 'build'>('decode')
const workchain = ref(0)
const wcItems = [{ label: '0 (basechain)', value: 0 }, { label: '-1 (masterchain)', value: -1 }]

// ---------------------------------------------------------------- decode
const input = ref('')
function onFile(f: DroppedFile) {
  const text = f.text?.trim() ?? ''
  input.value = text && /^[A-Za-z0-9+/=_\-\s]+$/.test(text) ? text : Buffer.from(f.bytes).toString('base64')
}
const decoded = computed(() => {
  if (!input.value.trim()) return null
  try {
    return { ok: true as const, data: decodeStateInit(input.value, workchain.value) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

// ---------------------------------------------------------------- build
const code = ref('')
const codeIsLibrary = ref(false)
const data = ref('')
const prefix = ref('')
const tick = ref(false)
const tock = ref(false)
const libs = ref<{ boc: string, public: boolean }[]>([])

function buildExample() {
  const init = loadStateInit(Cell.fromBase64(WALLET_V4R2_DEPLOY.stateInit).beginParse())
  code.value = init.code!.toBoc().toString('base64')
  codeIsLibrary.value = false
  data.value = init.data!.toBoc().toString('base64')
  prefix.value = ''
  tick.value = tock.value = false
  libs.value = []
  workchain.value = 0
}

const built = computed(() => {
  if (!code.value.trim()) return null
  try {
    return {
      ok: true as const,
      data: buildStateInit({
        code: code.value,
        codeIsLibrary: codeIsLibrary.value,
        data: data.value,
        fixedPrefixLength: prefix.value.trim() === '' ? null : Number(prefix.value),
        tick: tick.value,
        tock: tock.value,
        libraries: libs.value,
        workchain: workchain.value
      })
    }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})

function editInBuilder(info: StateInitInfo) {
  codeIsLibrary.value = !!info.code?.library
  code.value = info.code?.library ?? info.code?.boc ?? ''
  data.value = info.data?.boc ?? ''
  prefix.value = info.fixedPrefixLength === null ? '' : String(info.fixedPrefixLength)
  tick.value = !!info.special?.tick
  tock.value = !!info.special?.tock
  libs.value = info.libraries.map(l => ({ boc: l.boc, public: l.public }))
  workchain.value = info.workchain
  mode.value = 'build'
}

// ---------------------------------------------------------------- result
const result = computed(() => mode.value === 'decode'
  ? (decoded.value?.ok ? decoded.value.data : null)
  : (built.value?.ok ? built.value.data : null))

const amount = ref('0.05')
const amountNano = ref<bigint | null>(null)
const tcJson = computed(() => result.value
  ? JSON.stringify({ messages: [tonConnectMessage(result.value, (amountNano.value ?? 0n).toString(), isTestnet.value)] }, null, 2)
  : '')

const cellItems = (info: StateInitInfo): KeyValueItem[] => {
  const out: KeyValueItem[] = []
  if (info.code) {
    out.push({ label: 'Code hash', value: info.code.hash, mono: true, copy: true, hint: `${info.code.bits} bits, ${info.code.refs} refs at the root` })
    if (info.code.library) out.push({ label: 'Code is a library reference', value: info.code.library, mono: true, copy: true, hint: 'Exotic library cell: the chain loads the code with this hash from the masterchain library.' })
    if (info.code.wallet) out.push({ label: 'Recognised code', value: info.code.wallet, mono: false, copy: false })
  }
  else out.push({ label: 'Code', value: 'none (cannot deploy)', mono: false, copy: false })
  if (info.data) out.push({ label: 'Data hash', value: info.data.hash, mono: true, copy: true, hint: `${info.data.bits} bits, ${info.data.refs} refs at the root` })
  else out.push({ label: 'Data', value: 'none', mono: false, copy: false })
  if (info.walletData) {
    out.push({ label: 'Wallet public key', value: info.walletData.publicKey, mono: true, copy: true })
    out.push({ label: 'Wallet id (subwallet)', value: String(info.walletData.walletId), mono: true, copy: true })
    out.push({ label: 'Initial seqno', value: String(info.walletData.seqno), mono: true, copy: false })
  }
  out.push({ label: 'fixed_prefix_length (formerly split_depth)', value: info.fixedPrefixLength === null ? 'not set' : String(info.fixedPrefixLength), mono: false, copy: false })
  out.push({ label: 'Special (tick / tock)', value: info.special ? `tick ${info.special.tick ? 'on' : 'off'}, tock ${info.special.tock ? 'on' : 'off'}` : 'not set', mono: false, copy: false })
  return out
}

const addr = (info: StateInitInfo) => isTestnet.value
  ? { b: info.address.testnetBounceable, nb: info.address.testnetNonBounceable }
  : { b: info.address.bounceable, nb: info.address.nonBounceable }

const libColumns = [{ accessorKey: 'hash', header: 'Library hash' }, { accessorKey: 'public', header: 'Public' }]
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'Decode', value: 'decode', icon: 'i-lucide-scan-search' }, { label: 'Build', value: 'build', icon: 'i-lucide-hammer' }]"
      class="w-full"
    />

    <template v-if="mode === 'decode'">
      <div class="space-y-2">
        <UFormField label="StateInit or deploy message BOC" description="base64 or hex. A bare StateInit, or an external/internal message that deploys a contract (its init is extracted).">
          <UTextarea v-model="input" :rows="4" autoresize :maxrows="10" class="w-full font-mono" placeholder="te6cckEC…" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-x-4">
          <UButton label="Example: wallet v4R2 StateInit" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = WALLET_V4R2_DEPLOY.stateInit" />
          <UButton label="Example: jetton wallet deploy message" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="input = HMSTR_JETTON_WALLET_DEPLOY.message" />
          <UButton v-if="input" label="Clear" icon="i-lucide-eraser" variant="link" color="neutral" size="sm" class="px-0" @click="input = ''" />
        </div>
        <FileDrop v-if="!input" accept=".boc,.txt,.b64" text label="…or drop a .boc file" @file="onFile" />
      </div>
      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />
    </template>

    <template v-else>
      <div class="space-y-2">
        <UFormField label="Code" :description="codeIsLibrary ? 'Library hash: 64 hex characters (the hash of a public masterchain library).' : 'Code BOC (base64/hex) or a Blueprint build JSON {&quot;hex&quot;: …}.'">
          <UTextarea v-model="code" :rows="3" autoresize :maxrows="8" class="w-full font-mono" :placeholder="codeIsLibrary ? '0f1ad3d8a46b…' : 'te6cckEC…'" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <USwitch v-model="codeIsLibrary" label="Code is a library reference" />
          <UButton label="Try an example (wallet v4R2)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="buildExample" />
        </div>
      </div>
      <UFormField label="Data (optional)" description="Initial persistent data BOC. Leave empty for no data.">
        <UTextarea v-model="data" :rows="3" autoresize :maxrows="8" class="w-full font-mono" placeholder="te6cckEB…" />
      </UFormField>

      <details class="rounded-lg border border-default" :open="!!(prefix || tick || tock || libs.length)">
        <summary class="cursor-pointer px-3 py-2 text-sm text-muted">
          Advanced: fixed prefix, tick-tock, libraries
        </summary>
        <div class="space-y-4 border-t border-default p-3 sm:p-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="fixed_prefix_length" description="0–31, empty = not set. Formerly split_depth; lets the deployer pick the first N address bits.">
              <UInput v-model="prefix" inputmode="numeric" class="w-full font-mono" placeholder="not set" />
            </UFormField>
            <UFormField label="Special (masterchain system contracts)">
              <div class="flex gap-4 pt-1.5">
                <UCheckbox v-model="tick" label="tick" />
                <UCheckbox v-model="tock" label="tock" />
              </div>
            </UFormField>
          </div>
          <div class="space-y-2">
            <div class="text-sm font-medium">
              Libraries
            </div>
            <div v-for="(l, i) in libs" :key="i" class="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <UTextarea v-model="l.boc" :rows="1" autoresize :maxrows="4" class="min-w-0 flex-1 basis-56 font-mono" placeholder="library root cell BOC" :aria-label="`Library ${i + 1} BOC`" />
              <USwitch v-model="l.public" label="public" class="pt-1.5" />
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Remove library ${i + 1}`" @click="libs.splice(i, 1)" />
            </div>
            <UButton label="Add library" icon="i-lucide-plus" color="neutral" variant="outline" size="sm" @click="libs.push({ boc: '', public: true })" />
          </div>
        </div>
      </details>
      <UAlert v-if="built && !built.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />
    </template>

    <UFormField v-if="mode === 'build' || decoded?.ok" label="Workchain" :description="result && result.source !== 'stateinit' ? 'Taken from the message destination.' : undefined">
      <USelect v-model="workchain" :items="wcItems" class="w-full sm:w-56" :disabled="!!result && result.source !== 'stateinit'" />
    </UFormField>

    <template v-if="result">
      <UAlert
        v-if="result.destination"
        :color="result.destination === result.address.raw ? 'success' : 'warning'"
        variant="subtle"
        :icon="result.destination === result.address.raw ? 'i-lucide-circle-check' : 'i-lucide-triangle-alert'"
        :title="result.destination === result.address.raw ? `Found in an ${result.source}: the destination is the address of this StateInit` : `Found in an ${result.source}, but its destination ${result.destination} is not the StateInit address`"
      />

      <div class="space-y-1">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Contract address{{ isTestnet ? ' (testnet)' : '' }}
        </h3>
        <div class="divide-y divide-default">
          <ResultField label="Bounceable (contracts)" :value="addr(result).b">
            {{ addr(result).b }}
            <div class="mt-1">
              <ExplorerLinks :value="addr(result).b" />
            </div>
          </ResultField>
          <ResultField label="Non-bounceable (wallets)" :value="addr(result).nb" />
          <ResultField label="Raw" :value="result.address.raw" />
          <ResultField label="StateInit hash (= account id)" :value="result.hash" />
        </div>
        <p v-if="result.fixedPrefixLength" class="text-xs text-dimmed">
          With fixed_prefix_length {{ result.fixedPrefixLength }}, the first {{ result.fixedPrefixLength }} bits of the real address may be chosen by the deployer; the rest always come from this hash.
        </p>
      </div>

      <div class="space-y-1">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Contents
        </h3>
        <KeyValue :items="cellItems(result)" />
        <UTable v-if="result.libraries.length" :data="result.libraries" :columns="libColumns" class="rounded-md border border-default" :ui="{ td: 'font-mono text-xs break-all whitespace-normal', th: 'text-xs' }">
          <template #public-cell="{ row }">
            {{ row.original.public ? 'yes' : 'no' }}
          </template>
        </UTable>
        <UButton v-if="mode === 'decode'" label="Edit in builder" icon="i-lucide-pencil" color="neutral" variant="outline" class="mt-2" @click="editInBuilder(result)" />
      </div>

      <div class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Export
        </h3>
        <div class="divide-y divide-default">
          <ResultField label="StateInit (base64)" :value="result.boc" hint="The stateInit field of a TonConnect message, or the init of a deploy message." />
          <ResultField label="StateInit (hex)" :value="result.bocHex" />
        </div>
        <div class="max-w-xs">
          <AmountInput v-model="amount" v-model:nano="amountNano" label="Deploy amount" />
        </div>
        <JsonView :value="JSON.parse(tcJson)" label="TonConnect sendTransaction request (deploy)" />
        <p class="text-xs text-dimmed">
          Sent to the bounceable address: if deployment fails, the {{ COIN_SYMBOL }} bounce back. Add a payload if the contract expects one, and a validUntil (unix seconds, a few minutes ahead) when you send it.
        </p>
      </div>
    </template>
  </div>
</template>
