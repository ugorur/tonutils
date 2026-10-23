<script setup lang="ts">
import type { Address, Cell } from '@ton/core'
import type { KeyValueItem } from '~/components/KeyValue.vue'
import { runGetMethod } from '~/lib/nfts-write/chain'
import { parseBoc } from '~/utils/ton/messages'
import {
  buildContent, cellArg, collectionContentCell, contentRows, decodeContent, type DecodedContent, detectCell, EMPTY_CELL, gatewayUrl,
  isLink, itemContentCell, joinItemUrl, numArg, parseCollectionData, parseNftData, parseRoyaltyStack, royaltyCell, royaltyFromPercent,
  royaltyLabel, snakeText
} from './logic'

const mode = ref<'read' | 'build' | 'decode'>('read')
const { isTestnet } = useTonNetwork()
const tc = useToncenter()

const b64 = (c: Cell) => c.toBoc().toString('base64')
const safeDecode = (c: Cell): DecodedContent | { error: string } => {
  try {
    return decodeContent(c)
  }
  catch (e) {
    return { error: (e as Error).message }
  }
}
const safeText = (c: Cell) => {
  try {
    return snakeText(c)
  }
  catch {
    return null
  }
}

// ---------------------------------------------------------------- read from chain
const addrText = ref('')
const addr = shallowRef<Address | null>(null)
const loading = ref(false)
const stage = ref('')
const error = ref<unknown>(null)

interface ItemResult {
  kind: 'item'
  index: bigint
  init: boolean
  owner: Address | null
  collection: Address | null
  individual: Cell
  individualText: string | null
  full: Cell | null
  fullDecoded: DecodedContent | { error: string } | null
}
interface CollectionResult {
  kind: 'collection'
  nextItemIndex: bigint
  owner: Address | null
  content: Cell
  decoded: DecodedContent | { error: string }
  common: string | null
  royalty: { numerator: number, denominator: number, destination: Address | null } | null
  royaltyError?: string
}
const result = shallowRef<ItemResult | CollectionResult | null>(null)

async function read() {
  if (!addr.value) return
  const raw = addr.value.toRawString()
  const base = tc.baseUrl()
  loading.value = true
  error.value = null
  result.value = null
  try {
    stage.value = 'Asking the contract for get_nft_data…'
    let item: ReturnType<typeof parseNftData> | null = null
    try {
      item = parseNftData(await runGetMethod(base, raw, 'get_nft_data'))
    }
    catch (e) {
      if (e instanceof TonApiError) throw e
    }
    if (item) {
      let full: Cell | null = null
      if (item.collection) {
        stage.value = 'Asking the collection for the full content (get_nft_content)…'
        const s = await runGetMethod(base, item.collection.toRawString(), 'get_nft_content', [numArg(item.index), cellArg(item.individual)])
        full = parseBoc(String(s[0]?.value))
      }
      result.value = {
        kind: 'item',
        ...item,
        individualText: safeText(item.individual),
        full,
        fullDecoded: full ? safeDecode(full) : safeDecode(item.individual)
      }
      return
    }
    stage.value = 'Not an NFT item. Trying get_collection_data…'
    const col = parseCollectionData(await runGetMethod(base, raw, 'get_collection_data'))
    let royalty: CollectionResult['royalty'] = null
    let royaltyError: string | undefined
    stage.value = 'Reading royalty_params…'
    try {
      royalty = parseRoyaltyStack(await runGetMethod(base, raw, 'royalty_params'))
    }
    catch (e) {
      if (e instanceof TonApiError) throw e
      royaltyError = 'This collection has no royalty_params getter.'
    }
    stage.value = 'Reading the common item URL (get_nft_content with an empty suffix)…'
    let common: string | null = null
    try {
      const s = await runGetMethod(base, raw, 'get_nft_content', [numArg(0n), cellArg(EMPTY_CELL)])
      const d = decodeContent(parseBoc(String(s[0]?.value)))
      common = d.kind === 'offchain' ? d.uri : null
    }
    catch (e) {
      if (e instanceof TonApiError) throw e
    }
    result.value = { kind: 'collection', ...col, decoded: safeDecode(col.content), common, royalty, royaltyError }
  }
  catch (e) {
    error.value = e instanceof TonApiError ? e : new Error(`${(e as Error).message} This address does not look like an NFT item or collection.`)
  }
  finally {
    loading.value = false
    stage.value = ''
  }
}

function example(a: string) {
  addrText.value = a
  nextTick(read)
}

const friendly = (a: Address | null, bounceable = true) => (a ? a.toString({ bounceable, testOnly: isTestnet.value }) : '')

// ---------------------------------------------------------------- build
const kind = ref<'offchain' | 'onchain'>('offchain')
const uri = ref('')
const fields = reactive({ name: '', description: '', image: '', cover_image: '' })
const common = ref('')
const suffix = ref('')
const royaltyPct = ref('5')
const royaltyDestText = ref('')
const royaltyDest = shallowRef<Address | null>(null)

const built = computed(() => {
  const out: { content?: Cell, wrapper?: Cell, item?: Cell, royalty?: Cell, numerator?: number, error?: string, royaltyError?: string } = {}
  try {
    out.content = buildContent(kind.value, uri.value, fields)
    out.wrapper = collectionContentCell(out.content, common.value.trim())
  }
  catch (e) {
    out.error = (e as Error).message
  }
  if (suffix.value.trim()) out.item = itemContentCell(suffix.value.trim())
  if (royaltyDest.value) {
    try {
      const r = royaltyFromPercent(royaltyPct.value, royaltyDest.value)
      out.royalty = royaltyCell(r)
      out.numerator = r.numerator
    }
    catch (e) {
      out.royaltyError = (e as Error).message
    }
  }
  return out
})

function buildExample() {
  kind.value = 'offchain'
  uri.value = 'https://nft.ton.diamonds/diamonds.json'
  common.value = 'https://nft.ton.diamonds/nft/'
  suffix.value = '11/11.json'
  royaltyPct.value = '2.2'
  royaltyDestText.value = 'EQCJTkhd1W2wztkVNp_dsKBpv2SIoUWoIyzI7mQrbSrj_NSh'
}

// ---------------------------------------------------------------- decode
const boc = ref('')
const decoded = computed(() => {
  if (!boc.value.trim()) return null
  try {
    return { ok: true as const, d: detectCell(parseBoc(boc.value)) }
  }
  catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
})
const DECODE_EXAMPLES = [
  { label: 'Collection content (TON Diamonds)', value: 'te6cckEBAQEAKQAATgFodHRwczovL25mdC50b24uZGlhbW9uZHMvZGlhbW9uZHMuanNvbvllC1Q=' },
  { label: 'Item content (suffix)', value: 'te6cckEBAQEADAAAFDExLzExLmpzb24BbkL+' },
  { label: 'On-chain metadata (jetton)', value: 'te6cckECEgEAAiMAAQMAwAECASACAwIBWAQFAgEgCAkBQb998XSzONLlGNMamblECBwkNZZVU22pRZFeBboXInMZzwYBQb9CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewcAwgBodHRwczovL2Nkbi5ibHVtLmNvZGVzLzQ5NGM5NWY2LWU2YjAtNDZmOS1hMDQxLTE1NmM3Yjk5NmEzZS85MzdhZjVjYS1kNWZiLTRkNzYtYWY4NC1iMGU2ODRkZDhjYTkAwgBodHRwczovL2Nkbi5ibHVtLmNvZGVzL2I1ODBhYWFjLTUwMWEtNGYxNC04MGQ4LTU0N2QyMGM4ZTE4Zi9lNjJiMDJmYi1mMTkyLTQ1NDktOTY1MS0xY2U5NWU0NWViOTUCASAKCwIBIA4PAUG/RUam/+G3nP3Ya609uHQxPc3i+wXmp0qn81UtlhfHnRMMAUG/btT5QqeEjOLLBmt3oRKMah/4xD9Dii3OJGErqf+riwMNABwAUFVQU0tJUFAgR0FORwAKAFBVUEcBQb9SCN70b1odT53OZqswn0qFEwXxZvke952SPvWONPmiCRABQb9dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfREAlABXZSBtYWRlIHRoaXMgY29pbiBmb3Igb3VyIGZhdm9yaXRlIHN1YnNjcmliZXJzLCBldmVyeW9uZSB3aWxsIGhhdmUgYSBncm93AAQAORMXtJE=' }
]

function contentItems(c: DecodedContent | { error: string } | null): KeyValueItem[] {
  if (!c) return []
  if ('error' in c) return [{ label: 'Content', value: c.error, mono: false, copy: false }]
  return contentRows(c).map(r => ({ label: r.label, value: r.value }))
}
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="mode"
      :content="false"
      :items="[
        { label: 'Read', value: 'read', icon: 'i-lucide-radio-tower' },
        { label: 'Build', value: 'build', icon: 'i-lucide-hammer' },
        { label: 'Decode', value: 'decode', icon: 'i-lucide-scan-search' }
      ]"
      class="w-full"
    />

    <!-- ------------------------------------------------------------ read -->
    <template v-if="mode === 'read'">
      <form class="space-y-2" @submit.prevent="read">
        <AddressInput v-model="addrText" label="NFT item or collection address" @parsed="addr = $event" />
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <UButton type="submit" label="Read content" icon="i-lucide-download" :loading="loading" :disabled="!addr" />
          <UButton label="Try a collection" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example('EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir')" />
          <UButton label="Try an item" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example('EQDstIwX6ZQ9-57WA9dNBtQyDPXic-_AKQOFwTot37Dl6JrH')" />
        </div>
      </form>
      <p v-if="isTestnet" class="text-xs text-warning">
        Reading testnet. The examples are mainnet contracts: switch the network in the header to use them.
      </p>
      <LoadingState v-if="loading" :label="stage" />
      <ErrorNotice :error="error" title="Could not read this address" @retry="read" />

      <div v-if="result?.kind === 'item'" class="space-y-4" data-testid="read-result">
        <div class="flex flex-wrap gap-2">
          <UBadge color="primary" variant="subtle" icon="i-lucide-image" label="NFT item" />
          <UBadge v-if="!result.init" color="warning" variant="subtle" label="Not initialized" />
          <UBadge v-if="!result.collection" color="neutral" variant="subtle" label="Standalone (no collection)" />
        </div>
        <div class="divide-y divide-default">
          <ResultField label="Index" :value="result.index.toString()" />
          <ResultField v-if="result.collection" label="Collection" :value="friendly(result.collection)">
            <AddressLink :address="friendly(result.collection)" full />
          </ResultField>
          <ResultField v-if="result.owner" label="Owner" :value="friendly(result.owner)">
            <AddressLink :address="friendly(result.owner)" full />
          </ResultField>
          <ResultField
            label="Individual content (stored in the item)"
            :value="result.individualText ?? b64(result.individual)"
            :hint="result.collection ? 'For standard collections this is only the part appended to the collection\'s common URL.' : undefined"
          />
          <ResultField label="Individual content BOC" :value="b64(result.individual)" />
        </div>

        <div v-if="result.fullDecoded" class="rounded-lg border border-default p-4">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Full content{{ result.full ? ' (from the collection\'s get_nft_content)' : '' }}
          </h3>
          <KeyValue :items="contentItems(result.fullDecoded)" class="mt-1" />
          <template v-if="!('error' in result.fullDecoded) && result.fullDecoded.kind === 'offchain' && isLink(result.fullDecoded.uri)">
            <UButton :to="gatewayUrl(result.fullDecoded.uri)" target="_blank" rel="noopener nofollow" label="Open metadata JSON" icon="i-lucide-external-link" variant="soft" size="sm" class="mt-2" />
          </template>
          <ResultField v-if="result.full" label="Full content BOC" :value="b64(result.full)" />
        </div>
      </div>

      <div v-if="result?.kind === 'collection'" class="space-y-4" data-testid="read-result">
        <UBadge color="primary" variant="subtle" icon="i-lucide-layers" label="NFT collection" />
        <div class="divide-y divide-default">
          <ResultField label="Items minted (next_item_index)" :value="result.nextItemIndex.toString()" :hint="result.nextItemIndex < 0n ? 'Negative: items are not indexed sequentially (e.g. DNS-style collections).' : undefined" />
          <ResultField v-if="result.owner" label="Owner" :value="friendly(result.owner)">
            <AddressLink :address="friendly(result.owner)" full />
          </ResultField>
          <ResultField v-else label="Owner" value="none (addr_none)" :copy="false" hint="Nobody can mint or edit any more." />
        </div>
        <div class="rounded-lg border border-default p-4">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Collection content
          </h3>
          <KeyValue :items="contentItems(result.decoded)" class="mt-1" />
          <UButton v-if="!('error' in result.decoded) && result.decoded.kind === 'offchain' && isLink(result.decoded.uri)" :to="gatewayUrl(result.decoded.uri)" target="_blank" rel="noopener nofollow" label="Open collection JSON" icon="i-lucide-external-link" variant="soft" size="sm" class="mt-2" />
          <ResultField label="Content BOC" :value="b64(result.content)" />
        </div>
        <div class="divide-y divide-default">
          <ResultField v-if="result.common !== null" label="Common item URL (common_content)" :value="result.common" hint="Each item's suffix is appended to this, e.g. common + &quot;0.json&quot;." />
          <ResultField v-else label="Common item URL" value="Not available" :copy="false" hint="get_nft_content did not return an off-chain URL for an empty suffix: items may store full on-chain content." />
          <ResultField v-if="result.royalty" label="Royalty" :value="royaltyLabel(result.royalty)" :copy="false" :hint="`${result.royalty.numerator} / ${result.royalty.denominator} of every sale on marketplaces that honour TEP-66`" />
          <ResultField v-if="result.royalty?.destination" label="Royalty goes to" :value="friendly(result.royalty.destination, false)">
            <AddressLink :address="friendly(result.royalty.destination, false)" full />
          </ResultField>
          <ResultField v-if="result.royaltyError" label="Royalty" :value="result.royaltyError" :mono="false" :copy="false" />
        </div>
      </div>
    </template>

    <!-- ------------------------------------------------------------ build -->
    <template v-else-if="mode === 'build'">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-muted">
          Build the cells a standard NFT collection stores. Paste the BOCs into a deploy script or a message builder.
        </p>
        <UButton label="Fill TON Diamonds values" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="buildExample" />
      </div>

      <section class="space-y-3 rounded-lg border border-default p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          1. Collection content (TEP-64)
        </h3>
        <URadioGroup
          v-model="kind"
          orientation="horizontal"
          :items="[{ label: 'Off-chain JSON URL', value: 'offchain' }, { label: 'On-chain fields', value: 'onchain' }]"
        />
        <UFormField v-if="kind === 'offchain'" label="Collection metadata URL" hint="https://, ipfs:// or ar://">
          <UInput v-model="uri" placeholder="https://example.com/collection.json" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
        </UFormField>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <UFormField label="name">
            <UInput v-model="fields.name" class="w-full" />
          </UFormField>
          <UFormField label="image (URL)">
            <UInput v-model="fields.image" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
          <UFormField label="description" class="sm:col-span-2">
            <UTextarea v-model="fields.description" :rows="2" autoresize class="w-full" />
          </UFormField>
          <UFormField label="cover_image (URL)" class="sm:col-span-2">
            <UInput v-model="fields.cover_image" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
        </div>
        <UAlert v-if="built.error && (uri || Object.values(fields).some(Boolean))" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="built.error" />
        <ResultField v-if="built.content" label="Content cell BOC" :value="b64(built.content)" :hint="`Cell hash ${built.content.hash().toString('hex')}`" />
      </section>

      <section class="space-y-3 rounded-lg border border-default p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          2. Common item URL and the collection's content cell
        </h3>
        <UFormField label="Common content (base URL for items)" hint="Usually ends with /">
          <UInput v-model="common" placeholder="https://example.com/nft/" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
        </UFormField>
        <ResultField v-if="built.wrapper" label="Storage content cell: ^[collection_content common_content]" :value="b64(built.wrapper)" hint="The ref the collection keeps in its data (and op 4 edit-content takes)." />
      </section>

      <section class="space-y-3 rounded-lg border border-default p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          3. Item content
        </h3>
        <UFormField label="Item URL suffix" hint="Stored in the item, appended to the common URL">
          <UInput v-model="suffix" placeholder="0.json" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
        </UFormField>
        <template v-if="built.item">
          <ResultField label="Item content cell BOC" :value="b64(built.item)" />
          <ResultField label="Resolves to" :value="joinItemUrl(common.trim(), suffix.trim())" :hint="isLink(suffix) ? 'The suffix is a full URL; most indexers use it as is.' : undefined" />
        </template>
      </section>

      <section class="space-y-3 rounded-lg border border-default p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          4. Royalty (TEP-66)
        </h3>
        <div class="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <UFormField label="Royalty %" :error="built.royaltyError">
            <UInput v-model="royaltyPct" inputmode="decimal" class="w-full" />
          </UFormField>
          <AddressInput v-model="royaltyDestText" label="Paid to" @parsed="royaltyDest = $event" />
        </div>
        <template v-if="built.royalty">
          <ResultField label="royalty_params cell BOC" :value="b64(built.royalty)" :hint="`numerator ${built.numerator} / denominator 1000`" />
        </template>
      </section>
    </template>

    <!-- ------------------------------------------------------------ decode -->
    <template v-else>
      <BocInput v-model="boc" label="Content, royalty or collection content BOC" :examples="DECODE_EXAMPLES" />
      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />
      <div v-if="decoded?.ok" class="space-y-3" data-testid="decode-result">
        <template v-if="decoded.d.kind === 'content'">
          <UBadge color="primary" variant="subtle" :label="decoded.d.content.kind === 'offchain' ? 'TEP-64 off-chain content (0x01)' : 'TEP-64 on-chain content (0x00 dictionary)'" />
          <KeyValue :items="contentItems(decoded.d.content)" />
        </template>
        <template v-else-if="decoded.d.kind === 'collection-wrapper'">
          <UBadge color="primary" variant="subtle" label="Collection storage content: ^[collection_content common_content]" />
          <KeyValue :items="[...contentItems(decoded.d.content), { label: 'Common item URL', value: decoded.d.common }]" />
        </template>
        <template v-else-if="decoded.d.kind === 'royalty'">
          <UBadge color="primary" variant="subtle" label="TEP-66 royalty_params" />
          <KeyValue
            :items="[
              { label: 'Royalty', value: royaltyLabel(decoded.d.royalty), mono: false, copy: false },
              { label: 'Numerator / denominator', value: `${decoded.d.royalty.numerator} / ${decoded.d.royalty.denominator}`, copy: false },
              { label: 'Paid to', value: friendly(decoded.d.royalty.destination, false) }
            ]"
          />
        </template>
        <template v-else>
          <UBadge color="neutral" variant="subtle" label="Plain text (no TEP-64 tag): an item URL suffix or common_content" />
          <ResultField label="Text" :value="decoded.d.text" />
        </template>
      </div>
      <p class="text-xs text-dimmed">
        TEP-64 content starts with a tag byte: 0x01 for an off-chain URL, 0x00 for an on-chain dictionary keyed by sha256 of the field name.
        Items of a standard collection store only their URL suffix without a tag; the collection prepends 0x01 and its common URL in get_nft_content.
      </p>
    </template>
  </div>
</template>
