<script setup lang="ts">
import { Address, type Cell } from '@ton/core'
import type { TonConnectMessage } from '~/composables/useTonConnect'
import { accountStates, chunk, maxMessagesOf } from '~/lib/nfts-write/chain'
import { decodeContent, joinItemUrl, offchainContent, onchainContent, royaltyFromPercent, royaltyLabel, royaltyPercent, setOnchainField } from '~/lib/nfts-write/content'
import { COLLECTION_CODE_HASH } from '~/lib/nfts-write/getgems'
import SentNotice from '~/lib/nfts-write/SentNotice.vue'
import { type CollectionInfo, readCollection } from '~/lib/nfts-write/stack'
import { useSend } from '~/lib/nfts-write/useSend'
import {
  ADMIN_AMOUNT, changeOwnerBody, collectionJson, collectionStateInit, DEPLOY_AMOUNT, editContentBody, ITEM_AMOUNT, MAX_BATCH,
  MINT_BASE_FEE, mintMessages, numberedList, parseMintList, PER_ITEM_FEE
} from './logic'

const tab = ref<'create' | 'mint' | 'manage'>('create')
const tc = useTonConnect()
const ton = useToncenter()
const { network, isTestnet } = useTonNetwork()
const fr = (a: Address, bounceable = true) => a.toString({ bounceable, testOnly: isTestnet.value })
const walletAddr = computed(() => (tc.wallet.value && !tc.networkMismatch.value ? Address.parse(tc.wallet.value.address) : null))
const tryParse = (s: string) => {
  try {
    return s.trim() ? Address.parse(s.trim()) : null
  }
  catch {
    return null
  }
}

// ================================================================ create
const ownerText = ref('')
const contentKind = ref<'offchain' | 'onchain'>('offchain')
const uri = ref('')
const meta = reactive({ name: '', description: '', image: '', cover_image: '' })
const common = ref('')
const royaltyPct = ref('5')
const royaltyDestText = ref('')
watch(walletAddr, (a) => {
  if (a && !ownerText.value) ownerText.value = fr(a, false)
}, { immediate: true })

const owner = computed(() => tryParse(ownerText.value))
const royaltyDest = computed(() => tryParse(royaltyDestText.value) ?? owner.value)
const json = computed(() => collectionJson({ name: meta.name, description: meta.description, image: meta.image, coverImage: meta.cover_image }))

const deploy = computed(() => {
  if (!owner.value) return { error: 'Enter the owner address (your wallet, filled in when you connect).' }
  if (contentKind.value === 'offchain' && !uri.value.trim()) return { error: 'Enter the collection metadata URL.' }
  if (contentKind.value === 'onchain' && !meta.name.trim()) return { error: 'Give the collection a name.' }
  if (!common.value.trim()) return { error: 'Enter the base URL of your item JSON files.' }
  try {
    const royalty = royaltyFromPercent(royaltyPct.value, royaltyDest.value!)
    const content = contentKind.value === 'offchain' ? offchainContent(uri.value) : onchainContent({ ...meta })
    const r = collectionStateInit({ owner: owner.value, content, commonContent: common.value.trim(), royalty })
    const msg: TonConnectMessage = { address: fr(r.address, false), amount: DEPLOY_AMOUNT, stateInit: r.stateInit }
    return { address: r.address, royalty, messages: [msg] }
  }
  catch (e) {
    return { error: (e as Error).message }
  }
})

const existing = ref<'unknown' | 'free' | 'taken'>('unknown')
const checking = ref(false)
const checkError = ref<unknown>(null)
const confirmDeploy = ref(false)
const reviewing = ref(false)
async function review() {
  if (!('address' in deploy.value) || !deploy.value.address) return
  checking.value = true
  checkError.value = null
  try {
    const raw = deploy.value.address.toRawString()
    const st = (await accountStates(ton.v3, [raw])).get(raw.toUpperCase())
    existing.value = st?.status === 'active' ? 'taken' : 'free'
    reviewing.value = true
  }
  catch (e) {
    checkError.value = e
  }
  finally {
    checking.value = false
  }
}
watch(deploy, () => {
  reviewing.value = false
  confirmDeploy.value = false
  existing.value = 'unknown'
})

function createExample() {
  contentKind.value = 'offchain'
  uri.value = 'https://nft.ton.diamonds/diamonds.json'
  common.value = 'https://nft.ton.diamonds/nft/'
  royaltyPct.value = '2.2'
  Object.assign(meta, { name: 'TON Diamonds', description: '', image: '', cover_image: '' })
}

const deploySender = useSend()
const deployedAt = shallowRef<Address | null>(null)
async function sendDeploy() {
  if (!('messages' in deploy.value) || !deploy.value.messages) return
  const at = deploy.value.address
  const out = await deploySender.send(deploy.value.messages)
  if (out?.trace && !out.failed.length) deployedAt.value = at
}
function goMint(a: Address) {
  colText.value = fr(a)
  tab.value = 'mint'
  nextTick(loadCollection)
}

// ================================================================ shared: load a collection (mint + manage)
const colText = ref('')
const colAddr = computed(() => tryParse(colText.value))
const col = shallowRef<CollectionInfo | null>(null)
const colLoading = ref(false)
const colStage = ref('')
const colError = ref<unknown>(null)
async function loadCollection() {
  if (!colAddr.value) return
  colLoading.value = true
  colError.value = null
  col.value = null
  try {
    col.value = await readCollection(ton.baseUrl(), ton.v3, colAddr.value, s => (colStage.value = s))
    prefillEdit()
  }
  catch (e) {
    colError.value = e
  }
  finally {
    colLoading.value = false
  }
}
function colExample() {
  colText.value = 'EQAG2BH0JlmFkbMrLEnyn2bIITaOSssd4WdisE4BdFMkZbir'
  nextTick(loadCollection)
}
const standardCode = computed(() => col.value?.codeHash === COLLECTION_CODE_HASH)
const isOwner = computed(() => !!(col.value?.owner && walletAddr.value && col.value.owner.equals(walletAddr.value)))
const colFriendly = computed(() => (col.value ? fr(col.value.address) : ''))

// ================================================================ mint
const list = ref('')
const fillCount = ref(10)
const fillPattern = ref('{i}.json')
const mintOwner = computed(() => walletAddr.value ?? col.value?.owner ?? null)
const parsed = computed(() => (col.value && mintOwner.value ? parseMintList(list.value, mintOwner.value, col.value.nextItemIndex) : null))
const maxMsgs = computed(() => maxMessagesOf(tc.wallet.value?.device as { features?: (string | { name: string, maxMessages?: number })[] } | undefined))
const mintMsgs = computed(() => (col.value && parsed.value?.items.length ? mintMessages(colFriendly.value, parsed.value.items) : []))
const mintBatches = computed(() => chunk(mintMsgs.value, maxMsgs.value))
const mintSent = ref(0)
const mintTotal = computed(() => mintMsgs.value.reduce((s, m) => s + m.amount, 0n))
watch(list, () => (mintSent.value = 0))
function fillNumbered() {
  if (!col.value) return
  list.value = numberedList(col.value.nextItemIndex, Math.max(1, Math.min(1000, Math.floor(fillCount.value || 1))), fillPattern.value || '{i}.json')
}
const mintSender = useSend()
async function sendMint() {
  const batch = mintBatches.value[mintSent.value]
  if (!batch) return
  const out = await mintSender.send(batch)
  if (out?.trace && !out.failed.length) mintSent.value++
}
watch(col, () => {
  list.value = ''
  mintSent.value = 0
})

// ================================================================ manage
const newOwnerText = ref('')
const newOwner = computed(() => tryParse(newOwnerText.value))
const confirmOwner = ref(false)
watch(newOwnerText, () => (confirmOwner.value = false))
const ownerMsgs = computed<TonConnectMessage[]>(() => (col.value && newOwner.value ? [{ address: colFriendly.value, amount: ADMIN_AMOUNT, payload: changeOwnerBody(newOwner.value) }] : []))
const ownerSender = useSend()

const editKind = ref<'offchain' | 'onchain'>('offchain')
const editUri = ref('')
const editCommon = ref('')
const editPct = ref('')
const editDestText = ref('')
const editName = ref('')
/** Prefilled royalty text: while the user leaves it as is, the exact on-chain numerator/denominator is re-sent. */
const origPct = ref('')
function prefillEdit() {
  const c = col.value
  if (!c) return
  editKind.value = c.decoded?.kind ?? 'offchain'
  editUri.value = c.decoded?.kind === 'offchain' ? c.decoded.uri : ''
  editName.value = c.decoded?.kind === 'onchain' ? c.decoded.fields.find(f => f.key === 'name')?.text ?? '' : ''
  editCommon.value = c.common ?? ''
  editPct.value = c.royalty ? String(Math.round(royaltyPercent(c.royalty) * 10) / 10) : '0'
  origPct.value = editPct.value
  editDestText.value = c.royalty?.destination ? fr(c.royalty.destination, false) : ''
}
const editMsgs = computed(() => {
  const c = col.value
  if (!c) return { messages: [] as TonConnectMessage[] }
  try {
    const dest = tryParse(editDestText.value) ?? c.owner
    if (!dest) throw new Error('Enter the royalty address')
    if (!editCommon.value.trim()) throw new Error('Enter the common item URL')
    if (editKind.value === 'offchain' && !editUri.value.trim()) throw new Error('Enter the collection metadata URL')
    // On-chain content: change only the name and keep every other field (description, image, …) as stored.
    const content = editKind.value === 'offchain'
      ? offchainContent(editUri.value)
      : c.decoded?.kind === 'onchain' ? setOnchainField(c.content, 'name', editName.value) : onchainContent({ name: editName.value })
    const royalty = c.royalty && editPct.value.trim() === origPct.value ? { numerator: c.royalty.numerator, denominator: c.royalty.denominator, destination: dest } : royaltyFromPercent(editPct.value, dest)
    const body = editContentBody(content, editCommon.value.trim(), royalty)
    return { messages: [{ address: colFriendly.value, amount: ADMIN_AMOUNT, payload: body }] as TonConnectMessage[] }
  }
  catch (e) {
    return { messages: [] as TonConnectMessage[], error: (e as Error).message }
  }
})
const editSender = useSend()
async function afterAdmin(s: ReturnType<typeof useSend>, msgs: TonConnectMessage[]) {
  const out = await s.send(msgs)
  if (out?.trace && !out.failed.length) await loadCollection()
}

const contentLabel = (c: Cell) => {
  try {
    const d = decodeContent(c)
    return d.kind === 'offchain' ? d.uri : d.fields.map(f => `${f.key ?? '?'}: ${f.text ?? '…'}`).join(' · ')
  }
  catch {
    return 'Non-standard content'
  }
}
</script>

<template>
  <div class="space-y-6">
    <UTabs
      v-model="tab"
      :content="false"
      :items="[
        { label: 'Create', value: 'create', icon: 'i-lucide-package-plus' },
        { label: 'Mint', value: 'mint', icon: 'i-lucide-list-plus' },
        { label: 'Manage', value: 'manage', icon: 'i-lucide-user-round-cog' }
      ]"
      class="w-full"
    />

    <!-- ============================================================ create -->
    <template v-if="tab === 'create'">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <p class="max-w-prose text-sm text-muted">
          Deploys the standard getgems <span class="font-mono">nft-collection-editable</span> contract, the code most TON collections run
          (including TON Diamonds). Getgems, Tonkeeper and explorers recognise it. Upload your images and JSON first: the contract stores only links.
        </p>
        <UButton label="Fill example values" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="createExample" />
      </div>

      <section class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          1. Collection details
        </h3>
        <URadioGroup v-model="contentKind" orientation="horizontal" :items="[{ label: 'Metadata JSON URL', value: 'offchain' }, { label: 'Store name on-chain', value: 'onchain' }]" />
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Name" :hint="contentKind === 'offchain' ? 'For the JSON below' : 'Stored on chain'">
            <UInput v-model="meta.name" placeholder="My collection" class="w-full" />
          </UFormField>
          <UFormField label="Image URL">
            <UInput v-model="meta.image" placeholder="https://… or ipfs://…" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
          <UFormField label="Description" class="sm:col-span-2">
            <UTextarea v-model="meta.description" :rows="2" autoresize class="w-full" />
          </UFormField>
          <UFormField label="Cover image URL" class="sm:col-span-2" hint="Wide banner, optional">
            <UInput v-model="meta.cover_image" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
        </div>
        <template v-if="contentKind === 'offchain'">
          <details class="rounded-lg border border-default p-3 text-sm">
            <summary class="cursor-pointer font-medium text-highlighted">
              Collection JSON for these details (TEP-64)
            </summary>
            <p class="mt-2 text-muted">
              Host this file (IPFS, GitHub Pages, your site) and paste its URL below.
            </p>
            <pre class="mt-2 overflow-x-auto rounded bg-elevated p-3 font-mono text-xs">{{ json }}</pre>
            <div class="mt-2 flex gap-2">
              <CopyButton :value="json" label="Copy JSON" />
              <UButton label="Download" icon="i-lucide-download" size="xs" color="neutral" variant="soft" @click="downloadText(json, 'collection.json', 'application/json')" />
            </div>
          </details>
          <UFormField label="Collection metadata URL" required>
            <UInput v-model="uri" placeholder="https://example.com/collection.json" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
          </UFormField>
        </template>
        <UFormField label="Item base URL (common content)" required hint="Each item stores only a suffix like 0.json, appended to this">
          <UInput v-model="common" placeholder="https://example.com/nft/" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
        </UFormField>
        <p v-if="common.trim()" class="text-xs text-muted">
          Item 0 will read <span class="font-mono break-all">{{ joinItemUrl(common.trim(), '0.json') }}</span>
        </p>
      </section>

      <section class="space-y-3">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          2. Owner and royalty
        </h3>
        <AddressInput v-model="ownerText" label="Owner (can mint and edit)" />
        <div class="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <UFormField label="Royalty %" hint="0–100">
            <UInput v-model="royaltyPct" inputmode="decimal" class="w-full" />
          </UFormField>
          <AddressInput v-model="royaltyDestText" label="Royalty paid to" placeholder="Defaults to the owner" />
        </div>
      </section>

      <UAlert v-if="'error' in deploy && (uri || common || meta.name)" color="neutral" variant="subtle" icon="i-lucide-info" :title="deploy.error" />

      <section v-if="'address' in deploy && deploy.address" class="space-y-4 border-t border-default pt-5">
        <ResultField label="Your collection will live at" :value="fr(deploy.address)" hint="Computed from the code and settings: change anything and the address changes." />
        <UButton v-if="!reviewing" label="Review deploy" icon="i-lucide-eye" :loading="checking" @click="review" />
        <ErrorNotice :error="checkError" title="Could not check the address" @retry="review" />
        <template v-if="reviewing">
          <UAlert v-if="existing === 'taken'" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Already deployed" :description="`A collection with exactly these settings exists at this address. Deploying again would only add ${COIN_SYMBOL} to it. Mint into it instead.`">
            <template #actions>
              <UButton label="Mint into it" size="xs" color="warning" variant="outline" @click="goMint(deploy.address)" />
            </template>
          </UAlert>
          <template v-else>
            <TxPreview :messages="deploy.messages" />
            <p class="text-xs text-muted">
              The message carries the contract code and data (StateInit) and {{ formatCoin(DEPLOY_AMOUNT) }} that stays in the collection to pay for its storage.
            </p>
            <WalletGate purpose="deploy the collection">
              <template #default="{ wallet }">
                <UAlert v-if="owner && !owner.equals(Address.parse(wallet.address))" class="mb-3" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="The owner is not your connected wallet" description="Only the owner can mint and edit. Double-check you meant to create it for someone else." />
                <UCheckbox v-model="confirmDeploy" label="I checked the URLs, owner and royalty. A deployed contract cannot be undone." class="mb-3" />
                <UButton label="Deploy in wallet" icon="i-lucide-rocket" :disabled="!confirmDeploy" :loading="deploySender.sending.value" @click="sendDeploy" />
              </template>
            </WalletGate>
            <p v-if="deploySender.stage.value" class="text-sm text-muted">
              {{ deploySender.stage.value }}
            </p>
            <ErrorNotice :error="deploySender.error.value" title="Not deployed" />
            <SentNotice v-if="deploySender.last.value" :outcome="deploySender.last.value" success="Collection deployed" />
            <div v-if="deployedAt" class="flex flex-wrap items-center gap-3">
              <ExplorerLinks kind="collection" :value="fr(deployedAt)" />
              <UButton label="Mint items" icon="i-lucide-list-plus" size="sm" @click="goMint(deployedAt)" />
            </div>
          </template>
        </template>
      </section>
    </template>

    <!-- ============================================================ mint + manage: collection loader -->
    <template v-else>
      <form class="space-y-2" @submit.prevent="loadCollection">
        <AddressInput v-model="colText" label="Collection address" />
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
          <UButton type="submit" label="Load collection" icon="i-lucide-download" :loading="colLoading" :disabled="!colAddr" />
          <UButton label="Try TON Diamonds" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="colExample" />
        </div>
      </form>
      <LoadingState v-if="colLoading" :label="colStage" />
      <ErrorNotice :error="colError" title="Could not read this collection" @retry="loadCollection" />

      <div v-if="col" class="space-y-3 rounded-lg border border-default p-4" data-testid="collection-info">
        <div class="flex flex-wrap gap-2">
          <UBadge v-if="standardCode" color="primary" variant="subtle" icon="i-lucide-check" label="Standard getgems collection (editable)" />
          <UBadge v-else color="warning" variant="subtle" icon="i-lucide-triangle-alert" label="Non-standard collection code" />
          <UBadge v-if="isOwner" color="success" variant="subtle" label="You own it" />
        </div>
        <KeyValue
          :items="[
            { label: 'Content', value: contentLabel(col.content), mono: true },
            { label: 'Common item URL', value: col.common ?? '—' },
            { label: 'Items minted', value: col.nextItemIndex.toString(), copy: false },
            { label: 'Royalty', value: col.royalty ? royaltyLabel(col.royalty) : '—', copy: false, mono: false }
          ]"
        />
        <ResultField v-if="col.owner" label="Owner" :value="fr(col.owner, false)">
          <AddressLink :address="fr(col.owner, false)" full />
        </ResultField>
        <UAlert v-if="!standardCode" color="warning" variant="subtle" icon="i-lucide-triangle-alert" title="Not the code this tool deploys" description="Ops 1–3 (mint, batch mint, change owner) are the same in most collections based on ton-blockchain/token-contract, but this contract may differ. Edit content is disabled." />
        <UAlert v-if="walletAddr && col.owner && !isOwner" color="error" variant="subtle" icon="i-lucide-lock" title="Your wallet is not the owner" description="The collection rejects mint and admin messages from anyone else (exit code 401). Connect the owner wallet." />
      </div>

      <!-- ------------------------------------------------------------ mint -->
      <template v-if="tab === 'mint' && col">
        <section class="space-y-3">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Items to mint
          </h3>
          <p class="text-sm text-muted">
            One item per line: a URL suffix (appended to the common URL), optionally followed by a comma and the recipient's address.
            Without an address the item goes to {{ walletAddr ? 'your wallet' : 'the collection owner' }}. Indexes start at {{ col.nextItemIndex }}.
          </p>
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="Fill numbered">
              <UInput v-model.number="fillCount" type="number" min="1" max="1000" class="w-24" />
            </UFormField>
            <UFormField label="Pattern">
              <UInput v-model="fillPattern" class="w-36" :ui="{ base: 'font-mono text-sm' }" />
            </UFormField>
            <UButton label="Fill" icon="i-lucide-list-ordered" color="neutral" variant="outline" @click="fillNumbered" />
          </div>
          <UTextarea v-model="list" :rows="6" autoresize :maxrows="16" class="w-full" :ui="{ base: 'font-mono text-xs' }" :placeholder="`${col.nextItemIndex}.json\n${col.nextItemIndex + 1n}.json, UQ…recipient`" aria-label="Items to mint" />
          <UAlert v-for="e in parsed?.errors.slice(0, 5)" :key="e" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="e" />
          <div v-if="parsed?.items.length" class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-left text-xs">
              <thead class="text-muted">
                <tr><th class="px-3 py-2">#</th><th class="px-3 py-2">Metadata URL</th><th class="px-3 py-2">Owner</th></tr>
              </thead>
              <tbody class="divide-y divide-default font-mono">
                <tr v-for="it in parsed.items.slice(0, 8)" :key="String(it.index)">
                  <td class="px-3 py-1.5">
                    {{ it.index }}
                  </td>
                  <td class="px-3 py-1.5 break-all">
                    {{ joinItemUrl(col.common ?? '', it.content) }}
                  </td>
                  <td class="px-3 py-1.5 whitespace-nowrap">
                    {{ fr(it.owner, false).slice(0, 6) }}…{{ fr(it.owner, false).slice(-6) }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="parsed.items.length > 8" class="px-3 py-2 text-xs text-muted">
              …and {{ parsed.items.length - 8 }} more
            </p>
          </div>
        </section>

        <section v-if="mintMsgs.length" class="space-y-4 border-t border-default pt-5">
          <div class="text-sm text-muted">
            {{ parsed!.items.length }} item{{ parsed!.items.length === 1 ? '' : 's' }}: each gets {{ formatCoin(ITEM_AMOUNT) }} as its own balance,
            plus {{ formatCoin(PER_ITEM_FEE) }} per item and {{ formatCoin(MINT_BASE_FEE) }} per message for the collection's fees.
            Total <TokenAmount :nano="mintTotal" /> in {{ mintMsgs.length }} message{{ mintMsgs.length === 1 ? '' : 's' }} (up to {{ MAX_BATCH }} items each).
            <template v-if="mintBatches.length > 1">
              That is {{ mintBatches.length }} transactions, because your wallet takes {{ maxMsgs }} messages at a time.
            </template>
            Unused fees stay in the collection.
          </div>
          <UAlert color="neutral" variant="subtle" icon="i-lucide-info" title="Below, op 1 = mint one item, op 2 = batch mint" description="These collection ops are plain numbers, so the decoder cannot name them. Each message goes to your collection address." />
          <TxPreview :messages="mintBatches[mintSent] ?? []" />
          <WalletGate purpose="mint items">
            <UButton
              :label="mintSent >= mintBatches.length ? 'All minted' : mintBatches.length > 1 ? `Mint in wallet (transaction ${mintSent + 1} of ${mintBatches.length})` : 'Mint in wallet'"
              icon="i-lucide-stamp"
              :disabled="!isOwner || mintSent >= mintBatches.length"
              :loading="mintSender.sending.value"
              @click="sendMint"
            />
          </WalletGate>
          <p v-if="mintSender.stage.value" class="text-sm text-muted">
            {{ mintSender.stage.value }}
          </p>
          <ErrorNotice :error="mintSender.error.value" title="Not minted" />
          <SentNotice v-if="mintSender.last.value" :outcome="mintSender.last.value" success="Items minted" />
          <div v-if="mintSent && mintSent >= mintBatches.length" class="flex flex-wrap items-center gap-3">
            <ExplorerLinks kind="collection" :value="colFriendly" />
            <UButton label="Reload collection" icon="i-lucide-rotate-cw" size="xs" color="neutral" variant="soft" @click="loadCollection" />
          </div>
        </section>
      </template>

      <!-- ------------------------------------------------------------ manage -->
      <template v-if="tab === 'manage' && col">
        <section class="space-y-3 rounded-lg border border-default p-4">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Edit metadata and royalty
          </h3>
          <template v-if="standardCode">
            <URadioGroup v-model="editKind" orientation="horizontal" :items="[{ label: 'Metadata JSON URL', value: 'offchain' }, { label: 'Name on-chain', value: 'onchain' }]" />
            <UFormField v-if="editKind === 'offchain'" label="Collection metadata URL">
              <UInput v-model="editUri" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
            </UFormField>
            <UFormField v-else label="Name">
              <UInput v-model="editName" class="w-full" />
            </UFormField>
            <UFormField label="Item base URL (common content)" hint="Changes every item's metadata URL">
              <UInput v-model="editCommon" class="w-full" :ui="{ base: 'font-mono text-sm' }" />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <UFormField label="Royalty %">
                <UInput v-model="editPct" inputmode="decimal" class="w-full" />
              </UFormField>
              <AddressInput v-model="editDestText" label="Royalty paid to" />
            </div>
            <UAlert v-if="editMsgs.error" color="neutral" variant="subtle" icon="i-lucide-info" :title="editMsgs.error" />
            <template v-else>
              <UAlert color="neutral" variant="subtle" icon="i-lucide-info" title="Below, op 4 = edit content" description="Replaces the collection content, common URL and royalty in one go (all three are sent, prefilled with the current values)." />
              <TxPreview :messages="editMsgs.messages" />
              <WalletGate purpose="edit the collection">
                <UButton label="Save in wallet" icon="i-lucide-save" :disabled="!isOwner" :loading="editSender.sending.value" @click="afterAdmin(editSender, editMsgs.messages)" />
              </WalletGate>
              <ErrorNotice :error="editSender.error.value" title="Not saved" />
              <SentNotice v-if="editSender.last.value" :outcome="editSender.last.value" success="Collection updated" />
            </template>
          </template>
          <p v-else class="text-sm text-muted">
            Only available for the standard editable collection code.
          </p>
        </section>

        <section class="space-y-3 rounded-lg border border-error/40 p-4">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Transfer ownership
          </h3>
          <p class="text-sm text-muted">
            The new owner gets full control: minting, editing and transferring again. You cannot take it back. Set the zero address to lock the collection for good.
          </p>
          <AddressInput v-model="newOwnerText" label="New owner" />
          <template v-if="ownerMsgs.length">
            <UAlert color="neutral" variant="subtle" icon="i-lucide-info" title="Below, op 3 = change owner" />
            <TxPreview :messages="ownerMsgs" />
            <WalletGate purpose="transfer ownership">
              <UCheckbox v-model="confirmOwner" :label="`I give up control of this collection to ${newOwnerText.trim().slice(0, 8)}…`" class="mb-3" />
              <UButton label="Transfer in wallet" icon="i-lucide-user-round-cog" color="error" :disabled="!isOwner || !confirmOwner" :loading="ownerSender.sending.value" @click="afterAdmin(ownerSender, ownerMsgs)" />
            </WalletGate>
            <ErrorNotice :error="ownerSender.error.value" title="Not transferred" />
            <SentNotice v-if="ownerSender.last.value" :outcome="ownerSender.last.value" success="Ownership transferred" />
          </template>
        </section>
      </template>
    </template>

    <p class="text-xs text-dimmed">
      Network: {{ network }}. Try it on testnet first (switch in the header). Contracts: getgems-io/nft-contracts (MIT). Messages were tested in the TON sandbox
      emulator against this exact code, including a full {{ MAX_BATCH }}-item batch.
    </p>
  </div>
</template>
