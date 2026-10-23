<script setup lang="ts">
import type { Address } from '@ton/core'
import CheckList from '~/lib/jettons-dev/CheckList.vue'
import { fetchContentCell } from '~/lib/jettons-dev/chain'
import { checkUrl } from '~/lib/jettons-dev/fetchCheck'
import { mergeMetadata } from '~/tools/jetton-metadata-codec/logic'
import type { Check, MetaKind, Section, TonapiView } from './logic'
import {
  checkImageFetch, checkJsonFetch, checkUri, compareWithTonapi, decodeContent, EXAMPLES, KIND_LABEL, kindFromInterfaces,
  resolveUri, summarize, validateMetadata
} from './logic'

const source = ref<'address' | 'url' | 'json'>('address')
const address = ref('')
const parsed = shallowRef<Address | null>(null)
const url = ref('')
const pasted = ref('')
const manualKind = ref<MetaKind>('jetton')

const kindItems = (Object.keys(KIND_LABEL) as MetaKind[]).map(v => ({ label: KIND_LABEL[v], value: v }))
const tc = useToncenter()
const ta = useTonapi()
const { isTestnet } = useTonNetwork()

const running = ref(false)
const step = ref('')
const error = ref<unknown>(null)
const sections = ref<Section[]>([])
const kind = ref<MetaKind | null>(null)
const imageUrl = ref<string | null>(null)
const tonapiView = ref<TonapiView | null>(null)
const meta = ref<Record<string, unknown> | null>(null)

const canRun = computed(() => (source.value === 'address' ? !!parsed.value : source.value === 'url' ? !!url.value.trim() : !!pasted.value.trim()))

async function fileChecks(k: MetaKind, onchain: Record<string, string>, uri: string | null) {
  let offchain: Record<string, unknown> | null = null
  if (uri) {
    step.value = 'Loading the metadata JSON…'
    const uc = checkUri(uri)
    const fc = await checkUrl(resolveUri(uri))
    const j = checkJsonFetch(fc)
    offchain = j.json
    sections.value.push({ title: 'Metadata file', checks: [...uc, ...j.checks] })
  }
  const merged = mergeMetadata(onchain, offchain)
  meta.value = merged
  if (uri && !offchain && !Object.keys(onchain).filter(x => x !== 'uri').length) return merged
  sections.value.push({ title: 'Fields', checks: validateMetadata(k, merged) })

  const img = typeof merged.image === 'string' ? merged.image.trim() : ''
  if (img && /^(https?|ipfs):\/\//i.test(img)) {
    step.value = 'Checking the image…'
    imageUrl.value = resolveUri(img)
    sections.value.push({ title: 'Image', checks: checkImageFetch(await checkUrl(imageUrl.value), k) })
  }
  else if (typeof merged.image_data === 'string' && merged.image_data) {
    imageUrl.value = `data:${merged.image_data.trimStart().startsWith('PHN2Zy') || merged.image_data.trimStart().startsWith('PD94') ? 'image/svg+xml' : 'image/png'};base64,${merged.image_data}`
  }
  return merged
}

async function run() {
  if (!canRun.value) return
  running.value = true
  error.value = null
  sections.value = []
  imageUrl.value = null
  tonapiView.value = null
  meta.value = null
  kind.value = null
  try {
    if (source.value === 'address') {
      const a = parsed.value!
      step.value = 'Detecting the contract type…'
      const acc = await ta.get<{ interfaces?: string[], status?: string }>(`accounts/${a.toRawString()}`)
      const k = kindFromInterfaces(acc.interfaces)
      if (!k) {
        throw new Error(acc.status !== 'active'
          ? `This account is ${acc.status ?? 'not deployed'}: there is no contract to read metadata from.`
          : `This contract is not a jetton master, NFT item or NFT collection (tonapi sees: ${acc.interfaces?.join(', ') || 'no known interface'}). For a jetton, enter the master address, not a jetton wallet.`)
      }
      kind.value = k
      step.value = 'Reading the content cell…'
      const { cell } = await fetchContentCell(tc.baseUrl(), a, k)
      let decoded
      try {
        decoded = decodeContent(cell)
      }
      catch (e) {
        sections.value.push({ title: 'Content cell (TEP-64)', checks: [{ level: 'error', title: 'The content cell is not valid TEP-64', detail: (e as Error).message }] })
        return
      }
      const layoutCheck: Check = { level: 'ok', title: `Valid ${decoded.layout === 'offchain' ? 'off-chain' : decoded.layout === 'semichain' ? 'semi-chain' : 'on-chain'} content`, detail: decoded.entries.length ? `${decoded.entries.length} on-chain keys: ${decoded.entries.map(e => e.key ?? 'unknown').join(', ')}` : undefined }
      sections.value.push({ title: 'Content cell (TEP-64)', checks: [layoutCheck, ...decoded.warnings.map(w => ({ level: 'warn' as const, title: w }))] })
      const merged = await fileChecks(k, decoded.json, decoded.uri)

      step.value = 'Asking tonapi what wallets show…'
      tonapiView.value = await readTonapi(a, k)
      if (tonapiView.value) sections.value.push({ title: 'What wallets show (tonapi, used by Tonkeeper)', checks: compareWithTonapi(merged, tonapiView.value, k) })
    }
    else if (source.value === 'url') {
      kind.value = manualKind.value
      await fileChecks(manualKind.value, {}, url.value.trim())
    }
    else {
      kind.value = manualKind.value
      let j: unknown
      try {
        j = JSON.parse(pasted.value)
      }
      catch (e) {
        sections.value.push({ title: 'Metadata JSON', checks: [{ level: 'error', title: 'Not valid JSON', detail: (e as Error).message }] })
        return
      }
      if (!j || typeof j !== 'object' || Array.isArray(j)) {
        sections.value.push({ title: 'Metadata JSON', checks: [{ level: 'error', title: 'The JSON is not an object' }] })
        return
      }
      sections.value.push({ title: 'Metadata JSON', checks: [{ level: 'ok', title: 'Valid JSON object' }] })
      const obj = j as Record<string, unknown>
      meta.value = obj
      sections.value.push({ title: 'Fields', checks: validateMetadata(manualKind.value, obj) })
      const img = typeof obj.image === 'string' ? obj.image.trim() : ''
      if (img && /^(https?|ipfs):\/\//i.test(img)) {
        step.value = 'Checking the image…'
        imageUrl.value = resolveUri(img)
        sections.value.push({ title: 'Image', checks: checkImageFetch(await checkUrl(imageUrl.value), manualKind.value) })
      }
    }
  }
  catch (e) {
    error.value = e
  }
  finally {
    running.value = false
    step.value = ''
  }
}

async function readTonapi(a: Address, k: MetaKind): Promise<TonapiView | null> {
  try {
    if (k === 'jetton') {
      const j = await ta.get<{ metadata?: Record<string, string>, preview?: string, verification?: string }>(`jettons/${a.toRawString()}`)
      return { ...pick(j.metadata), preview: j.preview, verification: j.verification }
    }
    const path = k === 'nft-item' ? `nfts/${a.toRawString()}` : `nfts/collections/${a.toRawString()}`
    const n = await ta.get<{ metadata?: Record<string, unknown>, previews?: { resolution: string, url: string }[] }>(path)
    return { ...pick(n.metadata), preview: n.previews?.find(p => p.resolution === '500x500')?.url ?? n.previews?.at(-1)?.url }
  }
  catch {
    return null // tonapi may not have indexed it; the other checks still stand
  }
}
function pick(m: Record<string, unknown> | undefined): TonapiView {
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return { name: s(m?.name), symbol: s(m?.symbol), decimals: s(m?.decimals), image: s(m?.image), description: s(m?.description) }
}

const totals = computed(() => summarize(sections.value))

function example(v: string) {
  source.value = 'address'
  address.value = v
  nextTick(run)
}
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="source"
      :content="false"
      :items="[
        { label: 'Contract', value: 'address', icon: 'i-lucide-file-badge' },
        { label: 'URL', value: 'url', icon: 'i-lucide-link' },
        { label: 'JSON', value: 'json', icon: 'i-lucide-braces' }
      ]"
      class="w-full"
    />

    <form class="space-y-3" @submit.prevent="run">
      <template v-if="source === 'address'">
        <AddressInput v-model="address" label="Jetton master, NFT item or NFT collection" @parsed="parsed = $event" />
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <UButton
            v-for="ex in EXAMPLES"
            :key="ex.value"
            :label="ex.label"
            icon="i-lucide-sparkles"
            variant="link"
            size="sm"
            class="px-0"
            :disabled="isTestnet"
            @click="example(ex.value)"
          />
        </div>
      </template>
      <template v-else>
        <UFormField label="What is it for?">
          <USelect v-model="manualKind" :items="kindItems" class="w-full sm:w-72" />
        </UFormField>
        <template v-if="source === 'url'">
          <UFormField label="Metadata JSON URL" hint="https:// or ipfs://">
            <UInput v-model="url" placeholder="https://example.com/jetton.json" class="w-full" size="lg" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
          <UButton label="Try tether.to/usdt-ton.json" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="manualKind = 'jetton'; url = 'https://tether.to/usdt-ton.json'" />
        </template>
        <UFormField v-else label="Metadata JSON" hint="Check it before you upload or deploy">
          <UTextarea v-model="pasted" :rows="7" autoresize :maxrows="18" class="w-full" :ui="{ base: 'font-mono text-xs' }" spellcheck="false" placeholder="{ &quot;name&quot;: &quot;My token&quot;, &quot;symbol&quot;: &quot;MTK&quot;, &quot;decimals&quot;: &quot;9&quot;, &quot;image&quot;: &quot;https://…&quot; }" />
        </UFormField>
      </template>
      <UButton type="submit" label="Validate" icon="i-lucide-badge-check" size="lg" :loading="running" :disabled="!canRun" />
    </form>

    <LoadingState v-if="running" :label="step || 'Checking…'" />
    <ErrorNotice :error="error" @retry="run" />

    <template v-if="sections.length && !running">
      <div class="flex flex-col gap-4 rounded-lg border border-default p-4 sm:flex-row sm:items-center">
        <img
          v-if="tonapiView?.preview || imageUrl"
          :src="tonapiView?.preview || imageUrl!"
          alt="Token or NFT image"
          class="size-16 shrink-0 rounded-full border border-default bg-elevated object-cover"
          referrerpolicy="no-referrer"
        >
        <div v-else class="flex size-16 shrink-0 items-center justify-center rounded-full border border-dashed border-default text-dimmed">
          <UIcon name="i-lucide-image-off" class="size-6" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate font-display text-lg font-semibold text-highlighted">
            {{ (tonapiView?.name ?? meta?.name ?? 'No name') as string }}
            <span v-if="kind === 'jetton'" class="text-base font-normal text-muted">{{ (tonapiView?.symbol ?? meta?.symbol ?? '') as string }}</span>
          </div>
          <div class="text-sm text-muted">
            {{ kind ? KIND_LABEL[kind] : '' }}<template v-if="tonapiView"> · as tonapi shows it</template>
          </div>
        </div>
        <div class="flex gap-2">
          <UBadge :color="totals.errors ? 'error' : 'success'" variant="subtle" :label="`${totals.errors} error${totals.errors === 1 ? '' : 's'}`" />
          <UBadge :color="totals.warnings ? 'warning' : 'neutral'" variant="subtle" :label="`${totals.warnings} warning${totals.warnings === 1 ? '' : 's'}`" />
        </div>
      </div>
      <ExplorerLinks v-if="source === 'address' && parsed" :value="parsed.toString()" :kind="kind === 'jetton' ? 'jetton' : kind === 'nft-collection' ? 'collection' : 'nft'" />

      <CheckList v-for="s in sections" :key="s.title" :title="s.title" :checks="s.checks" />
      <JsonView v-if="meta" :value="meta" label="Metadata as read (on-chain keys merged over the JSON file)" />
    </template>

    <p class="text-xs text-dimmed">
      Metadata files and images are fetched by a small TonUtils URL checker (most hosts block browser requests): GET only, public hosts only, 2 MB limit, nothing stored.
      Chain data comes from toncenter and tonapi.
    </p>
  </div>
</template>
