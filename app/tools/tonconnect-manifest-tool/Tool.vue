<script setup lang="ts">
import CheckList from '~/lib/dev-tonconnect/CheckList.vue'
import type { Check, FetchResult, ManifestFields } from './logic'
import { appDomain, buildManifest, checkHosted, checkIcon, checkManifest, manifestUrlFrom, sortChecks } from './logic'

const EXAMPLE = 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json'

const tab = ref<'check' | 'create'>('check')

// ------------------------------------------------------------ check a hosted manifest
const input = ref('')
const loading = ref(false)
const inputError = ref('')
const report = shallowRef<{ url: string, checks: Check[], manifest: Record<string, unknown> | null } | null>(null)

function loadImage(src: string): Promise<{ width: number, height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    const t = setTimeout(() => resolve(null), 10_000)
    img.onload = () => { clearTimeout(t); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { clearTimeout(t); resolve(null) }
    img.referrerPolicy = 'no-referrer'
    img.src = src
  })
}

async function iconChecks(iconUrl: string): Promise<Check[]> {
  const [size, contentType] = await Promise.all([
    loadImage(iconUrl),
    // Readable only when the icon is served with CORS; otherwise we fall back to the file extension check.
    fetch(iconUrl, { method: 'HEAD', cache: 'no-store' }).then(r => (r.ok ? r.headers.get('content-type') : null), () => null)
  ])
  return checkIcon({ width: size?.width ?? null, height: size?.height ?? null, contentType })
}

async function check() {
  inputError.value = ''
  report.value = null
  let url: string
  try {
    url = manifestUrlFrom(input.value)
  }
  catch (e) {
    inputError.value = (e as Error).message
    return
  }
  loading.value = true
  try {
    // Plain cross-origin GET, no cookies: the same request a web wallet makes.
    let r: FetchResult
    try {
      const res = await fetch(url, { cache: 'no-store', credentials: 'omit' })
      r = { requestedUrl: url, status: res.status, finalUrl: res.url, redirected: res.redirected, contentType: res.headers.get('content-type'), cacheControl: res.headers.get('cache-control'), body: await res.text() }
    }
    catch (e) {
      r = { requestedUrl: url, status: null, error: (e as Error).message }
    }
    const hosted = checkHosted(r)
    const icon = typeof hosted.manifest?.iconUrl === 'string' && hosted.manifest.iconUrl.startsWith('https://') ? await iconChecks(hosted.manifest.iconUrl) : []
    report.value = { url, checks: sortChecks([...hosted.checks, ...icon]), manifest: hosted.manifest }
  }
  finally {
    loading.value = false
  }
}

function tryExample() {
  input.value = EXAMPLE
  check()
}

const summary = computed(() => {
  const c = report.value?.checks ?? []
  const errors = c.filter(x => x.level === 'error').length
  const warns = c.filter(x => x.level === 'warn').length
  if (errors) return { color: 'error' as const, icon: 'i-lucide-circle-x', text: `${errors} problem${errors > 1 ? 's' : ''} that can stop wallets from connecting${warns ? `, plus ${warns} warning${warns > 1 ? 's' : ''}` : ''}.` }
  if (warns) return { color: 'warning' as const, icon: 'i-lucide-triangle-alert', text: `Works, with ${warns} warning${warns > 1 ? 's' : ''} worth fixing.` }
  return { color: 'success' as const, icon: 'i-lucide-circle-check', text: 'Looks good. Wallets should accept this manifest.' }
})

function editInGenerator() {
  const m = report.value?.manifest ?? {}
  const s = (k: string) => (typeof m[k] === 'string' ? m[k] as string : '')
  Object.assign(form, { url: s('url'), name: s('name'), iconUrl: s('iconUrl'), termsOfUseUrl: s('termsOfUseUrl'), privacyPolicyUrl: s('privacyPolicyUrl') })
  tab.value = 'create'
}

// ------------------------------------------------------------ create
const form = reactive<Required<ManifestFields>>({ url: '', name: '', iconUrl: '', termsOfUseUrl: '', privacyPolicyUrl: '' })
const json = computed(() => buildManifest(form))
const formChecks = computed(() => (form.url || form.name || form.iconUrl ? sortChecks(checkManifest(JSON.parse(json.value))) : []))
const formDomain = computed(() => appDomain(JSON.parse(json.value)))

function exampleForm() {
  Object.assign(form, { url: 'https://example.com', name: 'Example App', iconUrl: 'https://example.com/icon-180.png', termsOfUseUrl: 'https://example.com/terms', privacyPolicyUrl: 'https://example.com/privacy' })
}

const HEADERS = `Access-Control-Allow-Origin: *
Content-Type: application/json
Cache-Control: public, max-age=3600`
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="tab"
      :content="false"
      :items="[{ label: 'Check', value: 'check', icon: 'i-lucide-search-check' }, { label: 'Create', value: 'create', icon: 'i-lucide-file-plus' }]"
      class="w-full"
    />

    <!-- CHECK -->
    <div v-if="tab === 'check'" class="space-y-5">
      <form class="space-y-2" @submit.prevent="check">
        <UFormField label="Manifest URL or your site" :error="inputError || undefined" help="A site address is checked at /tonconnect-manifest.json, the conventional location.">
          <div class="flex flex-col gap-2 sm:flex-row">
            <UInput v-model="input" placeholder="https://your-app.com/tonconnect-manifest.json" class="w-full font-mono" inputmode="url" autocomplete="off" data-testid="manifest-url" />
            <UButton type="submit" label="Check" icon="i-lucide-search-check" :loading="loading" :disabled="!input.trim()" class="justify-center" data-testid="check-button" />
          </div>
        </UFormField>
        <UButton v-if="!input" label="Try an example (TonConnect demo dApp)" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="tryExample" />
      </form>

      <LoadingState v-if="loading" label="Fetching the manifest and its icon from your browser…" />

      <template v-if="report">
        <UAlert :color="summary.color" variant="subtle" :icon="summary.icon" :title="summary.text" :description="report.url" data-testid="manifest-summary" />

        <div v-if="report.manifest" class="flex items-center gap-4 rounded-lg border border-default p-4">
          <img
            v-if="typeof report.manifest.iconUrl === 'string'"
            :src="report.manifest.iconUrl"
            alt=""
            referrerpolicy="no-referrer"
            class="size-14 shrink-0 rounded-xl border border-default bg-elevated object-cover"
          >
          <div class="min-w-0">
            <p class="text-xs text-muted">
              Wallets will show
            </p>
            <p class="truncate font-display font-semibold text-highlighted">
              {{ report.manifest.name || '(no name)' }}
            </p>
            <p class="truncate text-sm text-muted">
              {{ appDomain(report.manifest) ?? String(report.manifest.url ?? '') }}
            </p>
          </div>
        </div>

        <CheckList :items="report.checks" data-testid="manifest-checks" />

        <div v-if="report.manifest" class="space-y-3">
          <JsonView :value="report.manifest" label="tonconnect-manifest.json" />
          <UButton label="Fix it in the generator" icon="i-lucide-pencil" variant="outline" color="neutral" size="sm" @click="editInGenerator" />
        </div>
      </template>
    </div>

    <!-- CREATE -->
    <div v-else class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="App URL" required help="Your dApp's address, without a trailing slash." class="sm:col-span-2">
          <UInput v-model="form.url" placeholder="https://your-app.com" class="w-full font-mono" inputmode="url" data-testid="f-url" />
        </UFormField>
        <UFormField label="App name" required help="Shown in the wallet's connect prompt.">
          <UInput v-model="form.name" placeholder="My App" class="w-full" data-testid="f-name" />
        </UFormField>
        <UFormField label="Icon URL" required help="PNG, 180×180, https. No SVG.">
          <UInput v-model="form.iconUrl" placeholder="https://your-app.com/icon-180.png" class="w-full font-mono" inputmode="url" data-testid="f-icon" />
        </UFormField>
        <UFormField label="Terms of use URL" hint="Optional">
          <UInput v-model="form.termsOfUseUrl" placeholder="https://your-app.com/terms" class="w-full font-mono" inputmode="url" />
        </UFormField>
        <UFormField label="Privacy policy URL" hint="Optional">
          <UInput v-model="form.privacyPolicyUrl" placeholder="https://your-app.com/privacy" class="w-full font-mono" inputmode="url" />
        </UFormField>
      </div>
      <UButton v-if="!form.url && !form.name" label="Fill with the spec example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="exampleForm" />

      <template v-if="formChecks.length">
        <CheckList :items="formChecks" />
        <div class="overflow-hidden rounded-md border border-default bg-muted">
          <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-1.5">
            <span class="text-xs text-muted">tonconnect-manifest.json</span>
            <div class="flex items-center gap-1">
              <CopyButton :value="json" size="xs" label="Copy" />
              <UButton icon="i-lucide-download" label="Download" size="xs" variant="ghost" color="neutral" @click="downloadText(json, 'tonconnect-manifest.json', 'application/json')" />
            </div>
          </div>
          <pre class="overflow-auto p-3 font-mono text-xs leading-relaxed text-default" data-testid="manifest-json">{{ json }}</pre>
        </div>
        <div class="space-y-2 text-sm text-muted">
          <p>
            Host it at <code class="font-mono text-default">https://{{ formDomain ?? 'your-app.com' }}/tonconnect-manifest.json</code> and pass that URL as <code class="font-mono text-default">manifestUrl</code>. Serve it with these headers so web and extension wallets can read it:
          </p>
          <div class="flex items-start gap-2 rounded-md border border-default bg-muted p-3">
            <pre class="flex-1 overflow-auto font-mono text-xs text-default">{{ HEADERS }}</pre>
            <CopyButton :value="HEADERS" size="xs" />
          </div>
          <p>After deploying, check it in the other tab.</p>
        </div>
      </template>
    </div>
  </div>
</template>
