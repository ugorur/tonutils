<script setup lang="ts">
import type { Address, Cell } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { fetchContentCell } from '~/lib/jettons-dev/chain'
import { checkUrl } from '~/lib/jettons-dev/fetchCheck'
import { HMSTR_CONTENT, STGRAM_CONTENT, STON_CONTENT, USDT_CONTENT } from '~/lib/jettons-dev/fixtures'
import { resolveUri, uriScheme } from '~/lib/jettons-dev/metadata'
import { KNOWN_JETTONS } from '~/utils/ton/jetton'
import { parseBoc } from '~/utils/ton/messages'
import type { DecodedContent, Layout, ValueFormat } from './logic'
import { decodeContent, encodeContent, EXAMPLE_JSON, KNOWN_KEYS, LAYOUT_INFO, mergeMetadata } from './logic'

const mode = ref<'decode' | 'encode'>('decode')
const tc = useToncenter()
const { isTestnet } = useTonNetwork()

const FORMAT_LABEL: Record<ValueFormat | 'unknown', string> = {
  'snake': 'snake (0x00)',
  'snake-ref': 'snake, text in ref (0x00 + ^)',
  'chunked': 'chunked (0x01)',
  'unknown': 'no prefix (non-standard)'
}

const layoutItems = (Object.keys(LAYOUT_INFO) as Layout[]).map(v => ({ label: LAYOUT_INFO[v].label, value: v }))
const formatItems = (['snake', 'snake-ref', 'chunked'] as const).map(v => ({ label: FORMAT_LABEL[v], value: v }))

// ---------------------------------------------------------------- decode
const source = ref<'address' | 'boc'>('address')
const address = ref('')
const parsed = shallowRef<Address | null>(null)
const boc = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const fetched = shallowRef<Cell | null>(null)

async function readFromChain() {
  if (!parsed.value) return
  loading.value = true
  error.value = null
  fetched.value = null
  offchain.value = null
  try {
    fetched.value = (await fetchContentCell(tc.baseUrl(), parsed.value, 'jetton')).cell
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function tryAddress(master: string) {
  source.value = 'address'
  address.value = master
  nextTick(readFromChain)
}

const decoded = computed<{ ok: true, d: DecodedContent, cell: Cell } | { ok: false, error: string } | null>(() => {
  let cell: Cell | null = null
  try {
    if (source.value === 'address') cell = fetched.value
    else if (boc.value.trim()) cell = parseBoc(boc.value.trim())
  }
  catch (e) {
    return { ok: false, error: `Not a valid BOC: ${(e as Error).message}` }
  }
  if (!cell) return null
  try {
    return { ok: true, d: decodeContent(cell), cell }
  }
  catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})
watch(boc, () => (offchain.value = null))
watch(address, () => {
  fetched.value = null
  offchain.value = null
})

// off-chain JSON (through the URL checker: most metadata hosts send no CORS headers)
const offchain = shallowRef<{ json: Record<string, unknown> | null, error?: string, status?: number } | null>(null)
const offLoading = ref(false)
async function loadOffchain(uri: string) {
  offLoading.value = true
  offchain.value = null
  try {
    const r = await checkUrl(resolveUri(uri))
    if (r.error || !r.ok) offchain.value = { json: null, error: r.error ?? `HTTP ${r.status}`, status: r.status }
    else {
      try {
        const j = JSON.parse(r.text ?? '')
        offchain.value = j && typeof j === 'object' && !Array.isArray(j) ? { json: j } : { json: null, error: 'The file is not a JSON object' }
      }
      catch {
        offchain.value = { json: null, error: r.sniff === 'html' ? 'The URI returns a web page, not JSON' : 'The file is not valid JSON' }
      }
    }
  }
  catch (e) {
    offchain.value = { json: null, error: (e as Error).message }
  }
  finally {
    offLoading.value = false
  }
}
const merged = computed(() => (decoded.value?.ok && offchain.value?.json ? mergeMetadata(decoded.value.d.json, offchain.value.json) : null))

function editInEncoder() {
  if (!decoded.value?.ok) return
  const d = decoded.value.d
  layout.value = d.layout
  uri.value = d.uri ?? ''
  const { uri: _u, ...rest } = d.json
  json.value = JSON.stringify(rest, null, 2)
  format.value = (d.entries.find(e => e.format !== 'unknown')?.format as ValueFormat | undefined) ?? 'snake'
  mode.value = 'encode'
}

// ---------------------------------------------------------------- encode
const layout = ref<Layout>('onchain')
const format = ref<ValueFormat>('snake')
const json = ref(EXAMPLE_JSON)
const uri = ref('')
const encoded = computed(() => {
  try {
    const { cell, warnings } = encodeContent({ layout: layout.value, json: json.value, uri: uri.value, format: format.value })
    const base64 = cell.toBoc().toString('base64')
    const items: KeyValueItem[] = [
      { label: 'Content cell (base64 BOC)', value: base64, hint: 'Pass it as jetton_content when you deploy the minter, or to change_content.' },
      { label: 'Content cell (hex BOC)', value: cell.toBoc().toString('hex') },
      { label: 'Cell hash', value: cell.hash().toString('hex') }
    ]
    return { ok: true as const, cell, warnings, items, check: decodeContent(cell) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[{ label: 'Decode', value: 'decode', icon: 'i-lucide-scan-search' }, { label: 'Encode', value: 'encode', icon: 'i-lucide-braces' }]"
      class="w-full"
    />

    <!-- ============================== DECODE -->
    <template v-if="mode === 'decode'">
      <UTabs
        v-model="source"
        :content="false"
        variant="link"
        size="sm"
        :items="[{ label: 'Jetton master address', value: 'address' }, { label: 'Content cell (BOC)', value: 'boc' }]"
      />

      <div v-if="source === 'address'" class="space-y-2">
        <form class="flex flex-col gap-3 sm:flex-row sm:items-start" @submit.prevent="readFromChain">
          <AddressInput v-model="address" label="Jetton master address" class="min-w-0 flex-1" @parsed="parsed = $event" />
          <UButton type="submit" label="Read metadata" icon="i-lucide-download" size="lg" class="justify-center sm:mt-6" :loading="loading" :disabled="!parsed" />
        </form>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <UButton
            v-for="j in KNOWN_JETTONS.slice(0, 4)"
            :key="j.master"
            :label="`Try ${j.symbol}`"
            icon="i-lucide-sparkles"
            variant="link"
            size="sm"
            class="px-0"
            :disabled="isTestnet"
            @click="tryAddress(j.master)"
          />
        </div>
        <LoadingState v-if="loading" label="Running get_jetton_data…" />
        <ErrorNotice :error="error" @retry="readFromChain" />
      </div>

      <BocInput
        v-else
        v-model="boc"
        label="TEP-64 content cell"
        :examples="[
          { label: 'USD₮ (semi-chain)', value: USDT_CONTENT },
          { label: 'stGRAM (on-chain)', value: STGRAM_CONTENT },
          { label: 'STON (off-chain)', value: STON_CONTENT },
          { label: 'HMSTR (text in ref)', value: HMSTR_CONTENT }
        ]"
      />

      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />

      <template v-if="decoded?.ok">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge color="primary" variant="subtle" :label="LAYOUT_INFO[decoded.d.layout].label" />
            <UBadge v-if="decoded.d.entries.length" color="neutral" variant="subtle" :label="`${decoded.d.entries.length} key${decoded.d.entries.length > 1 ? 's' : ''}`" />
            <UButton label="Edit in encoder" icon="i-lucide-pencil" variant="ghost" size="xs" @click="editInEncoder" />
          </div>
          <p class="text-sm text-muted">
            {{ LAYOUT_INFO[decoded.d.layout].detail }}
          </p>
        </div>

        <UAlert v-for="w in decoded.d.warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-info" :title="w" />

        <div v-if="decoded.d.entries.length" class="overflow-hidden rounded-lg border border-default">
          <div v-for="e in decoded.d.entries" :key="e.hash" class="grid gap-1 border-b border-default p-3 last:border-b-0 sm:grid-cols-[10rem_1fr]">
            <div class="min-w-0">
              <div class="font-mono text-sm text-highlighted">
                {{ e.key ?? 'unknown key' }}
              </div>
              <div class="text-xs text-dimmed">
                {{ FORMAT_LABEL[e.format] }}
              </div>
            </div>
            <div class="flex min-w-0 items-start gap-2">
              <div class="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap" :class="e.isText ? '' : 'font-mono text-xs break-all'">
                {{ e.value.length > 600 ? e.value.slice(0, 600) + '…' : e.value }}
                <div v-if="!e.key" class="mt-1 font-mono text-xs break-all text-dimmed">
                  sha256 key: {{ e.hash }}
                </div>
              </div>
              <CopyButton :value="e.value" size="xs" />
            </div>
          </div>
        </div>

        <div v-if="decoded.d.uri" class="space-y-3 rounded-lg border border-default p-4">
          <ResultField label="Off-chain metadata URI" :value="decoded.d.uri" />
          <div class="flex flex-wrap items-center gap-3">
            <UButton label="Load the off-chain JSON" icon="i-lucide-cloud-download" variant="soft" :loading="offLoading" @click="loadOffchain(decoded.d.uri)" />
            <ULink v-if="['https', 'http', 'ipfs'].includes(uriScheme(decoded.d.uri))" :to="resolveUri(decoded.d.uri)" target="_blank" rel="noopener noreferrer" class="text-xs text-muted underline">
              Open in a new tab
            </ULink>
          </div>
          <UAlert v-if="offchain?.error" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="Could not read the off-chain JSON" :description="offchain.error" />
          <template v-if="offchain?.json">
            <JsonView :value="offchain.json" label="Off-chain JSON" />
            <JsonView :value="merged" label="Merged metadata (on-chain keys win, as TEP-64 says)" />
          </template>
        </div>
        <JsonView v-else :value="decoded.d.json" label="Metadata JSON" />
        <p class="text-xs text-dimmed">
          The URI is fetched by a TonUtils URL checker because most metadata hosts don't allow browser requests. For a full check of the image and what wallets show, use the metadata validator.
        </p>
      </template>
    </template>

    <!-- ============================== ENCODE -->
    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Layout" :hint="LAYOUT_INFO[layout].label">
          <USelect v-model="layout" :items="layoutItems" class="w-full" />
        </UFormField>
        <UFormField v-if="layout !== 'offchain'" label="Value encoding">
          <USelect v-model="format" :items="formatItems" class="w-full" />
        </UFormField>
      </div>
      <p class="-mt-2 text-sm text-muted">
        {{ LAYOUT_INFO[layout].detail }}
      </p>

      <UFormField v-if="layout !== 'onchain'" :label="layout === 'offchain' ? 'Metadata JSON URI' : 'Off-chain JSON URI (uri key)'" hint="https:// or ipfs://">
        <UInput v-model="uri" placeholder="https://example.com/jetton.json" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
      </UFormField>

      <div v-if="layout !== 'offchain'" class="space-y-2">
        <UFormField label="Metadata JSON" hint="Any keys">
          <UTextarea v-model="json" :rows="8" autoresize :maxrows="20" class="w-full" :ui="{ base: 'font-mono text-xs' }" spellcheck="false" />
        </UFormField>
        <div class="flex flex-wrap gap-x-4">
          <UButton label="Load the stGRAM example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="json = EXAMPLE_JSON; layout = 'onchain'" />
          <UButton v-if="json" label="Clear" icon="i-lucide-x" variant="link" color="neutral" size="sm" class="px-0" @click="json = ''" />
        </div>
        <p class="text-xs text-dimmed">
          Standard keys: {{ KNOWN_KEYS.slice(1, 9).join(', ') }}; any other key is stored under its sha256.
          Values are stored as UTF-8 strings (numbers like decimals become "9"). <code>image_data</code> is read as base64 and stored as raw image bytes.
        </p>
      </div>

      <UAlert v-if="!encoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="encoded.error" />
      <template v-else>
        <UAlert v-for="w in encoded.warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-info" :title="w" />
        <KeyValue :items="encoded.items" />
        <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-circle-check" class="text-success" />
          Decodes back as {{ LAYOUT_INFO[encoded.check.layout].label.toLowerCase() }}{{ encoded.check.entries.length ? ` with ${encoded.check.entries.length} value${encoded.check.entries.length === 1 ? '' : 's'}` : ' (URI only)' }}.
        </div>
      </template>
    </template>
  </div>
</template>
