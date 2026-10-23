<script setup lang="ts">
import type { BuiltRequest, Endpoint, Net, ProviderId } from './logic'
import { buildRequest, curlSnippet, exampleValues, fetchSnippet, parseSpec, PROVIDERS, tonClientSnippet } from './logic'

// Specs are big (250–320 KB); load each once per page.
const specCache = new Map<ProviderId, Promise<Endpoint[]>>()
function loadSpec(id: ProviderId): Promise<Endpoint[]> {
  let p = specCache.get(id)
  if (!p) {
    const prov = PROVIDERS[id]
    // toncenter specs live on the API host: go through the shared queue. tonapi's spec is on GitHub.
    p = (prov.client === 'toncenter'
      ? rateLimitedJson<unknown>(prov.spec, { provider: 'toncenter' })
      : fetch(prov.spec).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} loading ${prov.spec}`)
          return r.json() as Promise<unknown>
        })
    ).then(parseSpec)
    p.catch(() => specCache.delete(id))
    specCache.set(id, p)
  }
  return p
}

const site = useTonNetwork().network
const providerId = ref<ProviderId>('toncenter-v2')
const net = ref<Net>(site.value)
watch(site, (v) => { net.value = v })
const provider = computed(() => PROVIDERS[providerId.value])
const origin = computed(() => provider.value.origin[net.value])

const endpoints = shallowRef<Endpoint[]>([])
const specLoading = ref(false)
const specError = ref<unknown>(null)
const endpointId = ref<string>('')
const endpoint = computed(() => endpoints.value.find(e => e.id === endpointId.value) ?? null)

async function loadEndpoints() {
  specLoading.value = true
  specError.value = null
  endpoints.value = []
  const id = providerId.value
  try {
    const eps = await loadSpec(id)
    if (id !== providerId.value) return
    endpoints.value = eps
    endpointId.value = eps.some(e => e.id === provider.value.defaultEndpoint) ? provider.value.defaultEndpoint : eps[0]?.id ?? ''
  }
  catch (e) {
    specError.value = e
  }
  finally {
    specLoading.value = false
  }
}
watch(providerId, loadEndpoints, { immediate: true })

const endpointItems = computed(() => endpoints.value.map(e => ({ label: e.id, value: e.id, description: e.summary, tag: e.tag })))

const values = ref<Record<string, string>>({})
const body = ref('')
watch(endpoint, (e) => {
  values.value = e ? exampleValues(e) : {}
  body.value = e?.body?.example ?? ''
  response.value = null
})

const built = computed<{ req: BuiltRequest | null, error: string | null }>(() => {
  if (!endpoint.value) return { req: null, error: null }
  try {
    return { req: buildRequest(endpoint.value, values.value, body.value, origin.value), error: null }
  }
  catch (e) {
    return { req: null, error: (e as Error).message }
  }
})

const broadcasts = computed(() => !!endpoint.value && /send|\/message$|emulate/i.test(endpoint.value.path) && endpoint.value.method === 'POST')

// ------------------------------------------------------------ run
interface Response { ok: boolean, status: number, ms: number, data: unknown, error?: unknown, url: string }
const response = shallowRef<Response | null>(null)
const running = ref(false)

async function run() {
  const req = built.value.req
  if (!req || running.value) return
  running.value = true
  const t0 = performance.now()
  try {
    const data = await rateLimitedJson<unknown>(req.url, { provider: provider.value.client }, req.method === 'POST'
      ? { method: 'POST', body: req.body ?? '', headers: { 'content-type': 'application/json' } }
      : undefined)
    response.value = { ok: true, status: 200, ms: Math.round(performance.now() - t0), data, url: req.url }
  }
  catch (e) {
    const api = e instanceof TonApiError ? e : null
    response.value = { ok: false, status: api?.status ?? 0, ms: Math.round(performance.now() - t0), data: api?.body ?? null, error: e, url: req.url }
  }
  finally {
    running.value = false
  }
}

// ------------------------------------------------------------ snippets
const snippetTab = ref<'curl' | 'fetch' | 'ton'>('curl')
const tonSnippet = computed(() => (endpoint.value ? tonClientSnippet(endpoint.value, values.value, origin.value) : null))
const snippet = computed(() => {
  const r = built.value.req
  if (!r) return ''
  if (snippetTab.value === 'fetch') return fetchSnippet(r)
  if (snippetTab.value === 'ton') return tonSnippet.value ?? ''
  return curlSnippet(r)
})
watch(tonSnippet, (s) => {
  if (!s && snippetTab.value === 'ton') snippetTab.value = 'curl'
})
const snippetTabs = computed(() => [
  { label: 'curl', value: 'curl' },
  { label: 'fetch', value: 'fetch' },
  ...(tonSnippet.value ? [{ label: '@ton/ton', value: 'ton' }] : [])
])

const short = (s?: string) => (s && s.length > 220 ? `${s.slice(0, 217)}…` : s)
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
      <UFormField label="API">
        <UTabs
          v-model="providerId"
          :content="false"
          size="sm"
          :items="[{ label: 'toncenter v2', value: 'toncenter-v2' }, { label: 'toncenter v3', value: 'toncenter-v3' }, { label: 'tonapi', value: 'tonapi' }]"
          class="w-full"
          data-testid="provider-tabs"
        />
      </UFormField>
      <UFormField label="Network">
        <USelect v-model="net" :items="[{ label: 'Mainnet', value: 'mainnet' }, { label: 'Testnet', value: 'testnet' }]" class="w-full" />
      </UFormField>
    </div>

    <LoadingState v-if="specLoading" :label="`Loading the ${provider.name} OpenAPI spec…`" />
    <ErrorNotice v-else-if="specError" :error="specError" title="Could not load the API spec" @retry="loadEndpoints" />

    <template v-if="endpoints.length">
      <UFormField :label="`Endpoint (${endpoints.length})`" :help="endpoint?.summary">
        <USelectMenu
          v-model="endpointId"
          :items="endpointItems"
          value-key="value"
          description-key="description"
          :filter-fields="['label', 'description', 'tag']"
          :search-input="{ placeholder: 'Search: balance, jetton, runGetMethod…' }"
          class="w-full font-mono"
          data-testid="endpoint-select"
        />
      </UFormField>

      <template v-if="endpoint">
        <p v-if="endpoint.description && endpoint.description !== endpoint.summary" class="text-sm text-muted">
          {{ short(endpoint.description) }}
        </p>

        <div v-if="endpoint.params.length" class="grid gap-4 sm:grid-cols-2">
          <UFormField
            v-for="p in endpoint.params"
            :key="p.name"
            :label="p.name"
            :required="p.required"
            :hint="`${p.in} · ${p.type}${p.type === 'array' ? ' (comma separated)' : ''}`"
            :help="short(p.description)"
            :class="p.address || p.type === 'array' ? 'sm:col-span-2' : ''"
          >
            <USelect
              v-if="p.enum || p.type === 'boolean'"
              :model-value="values[p.name] || '__none'"
              :items="[...(p.required ? [] : [{ label: '(not set)', value: '__none' }]), ...(p.enum ?? ['true', 'false']).map(v => ({ label: v, value: v }))]"
              class="w-full"
              @update:model-value="(v: string) => (values[p.name] = v === '__none' ? '' : v)"
            />
            <UInput v-else v-model="values[p.name]" :placeholder="p.example ?? p.default ?? ''" class="w-full font-mono" autocomplete="off" :data-testid="`param-${p.name}`" />
          </UFormField>
        </div>
        <p v-else-if="endpoint.method === 'GET'" class="text-sm text-muted">
          No parameters.
        </p>

        <UFormField v-if="endpoint.method === 'POST'" label="JSON body" :required="endpoint.body?.required" help="Prefilled from the spec's schema. Edit before sending.">
          <UTextarea v-model="body" :rows="6" autoresize class="w-full font-mono text-xs" data-testid="body-input" />
        </UFormField>

        <UAlert v-if="broadcasts" color="warning" variant="subtle" icon="i-lucide-radio" title="This endpoint sends or emulates a message" description="A valid signed BOC posted here is broadcast to the network for real (emulate endpoints only simulate)." />

        <div class="flex flex-wrap items-center gap-3">
          <UButton label="Send request" icon="i-lucide-play" :loading="running" :disabled="!built.req" data-testid="send-request" @click="run" />
          <span v-if="built.error" class="text-sm text-error">{{ built.error }}</span>
          <span v-else class="text-xs text-muted">From your browser, no API key. About 1 request per second.</span>
        </div>

        <div v-if="built.req" class="overflow-hidden rounded-md border border-default bg-muted">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-2 py-1">
            <UTabs v-model="snippetTab" :content="false" size="xs" variant="link" :items="snippetTabs" />
            <CopyButton :value="snippet" size="xs" />
          </div>
          <pre class="overflow-auto p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-default" data-testid="snippet">{{ snippet }}</pre>
        </div>

        <section v-if="response" class="space-y-2" aria-label="Response" data-testid="response">
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <UBadge :color="response.ok ? 'success' : 'error'" variant="subtle" :label="response.status ? `HTTP ${response.status}` : 'No response'" />
            <span class="text-muted">{{ response.ms }} ms (includes the shared request queue)</span>
          </div>
          <ErrorNotice v-if="response.error && (!response.data || response.status === 429 || response.status === 0)" :error="response.error" @retry="run" />
          <JsonView v-if="response.data !== null && response.data !== undefined" :value="response.data" :label="response.ok ? 'Response' : 'Error body'" />
        </section>
      </template>

      <p class="text-xs text-dimmed">
        Endpoints come live from the provider's own spec:
        <a :href="provider.spec" target="_blank" rel="noopener" class="break-all underline">{{ provider.spec.replace('https://', '') }}</a> ·
        <a :href="provider.docs" target="_blank" rel="noopener" class="underline">docs</a>.
        Some endpoints need an API key for higher limits; use your own key server-side, never in browser code.
      </p>
    </template>
  </div>
</template>
