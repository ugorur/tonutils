<script setup lang="ts">
import { cellFromApi, parseAddressOrHash, summarizeCode } from '~/lib/contracts-read/cells'
import { proxyUrl, toSourceView, verifierPageUrl, type SourceView, type VerifierResponse } from './logic'

const EXAMPLES = [
  { label: 'USD₮ jetton master', value: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs' },
  { label: 'USD₮ jetton wallet', value: 'EQAmJs8wtwK93thF78iD76RQKf9Z3v2sxM57iwpZZtdQAiVM' }
]

const route = useRoute()
const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const tc = useToncenter()
const { isTestnet } = useTonNetwork()

const loading = ref(false)
const error = ref<unknown>(null)
const view = ref<SourceView | null>(null)
const target = ref('')
const viaLibrary = ref(false)
const fileIdx = ref(0)
const showStdlib = ref(false)

const visibleFiles = computed(() => (view.value?.files ?? []).filter(f => showStdlib.value || !f.is_stdlib))
const file = computed(() => visibleFiles.value[fileIdx.value] ?? visibleFiles.value[0])
const stdlibCount = computed(() => (view.value?.files ?? []).filter(f => f.is_stdlib).length)

async function run() {
  error.value = null
  view.value = null
  viaLibrary.value = false
  fileIdx.value = 0
  loading.value = true
  try {
    const parsed = parseAddressOrHash(input.value)
    let hash: string
    if (parsed.kind === 'address') {
      target.value = parsed.address.toString({ testOnly: isTestnet.value })
      const acc = await tc.v3<{ code: string | null, status: string }>('account', { address: parsed.address.toRawString() })
      if (!acc.code) throw new Error(`This account has no code (status: ${acc.status}), so there is nothing to verify.`)
      const s = summarizeCode(cellFromApi(acc.code))
      hash = s.effectiveHash
      viaLibrary.value = s.effectiveHash !== s.hashHex
    }
    else {
      hash = parsed.hex
      target.value = hash
    }
    const res = await $fetch<VerifierResponse>(proxyUrl(hash)).catch((e: { data?: { statusMessage?: string } }) => {
      throw new Error(`${e.data?.statusMessage ?? 'verifier.ton.org could not be reached'}. Press "Look up source" to retry.`)
    })
    view.value = toSourceView(res)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function useExample(v: string) {
  input.value = v
  run()
}

const dateFmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

if (input.value) onMounted(run)
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Contract address or code hash" help="Code hash: 64 hex characters or base64, as shown by explorers and toncenter.">
        <UInput v-model="input" class="w-full font-mono" placeholder="EQ… / 0:… / 18d5b6e7…" />
      </UFormField>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UButton type="submit" label="Look up source" icon="i-lucide-search-code" :loading="loading" :disabled="!input.trim()" />
        <span class="text-sm text-muted">Try:</span>
        <UButton v-for="ex in EXAMPLES" :key="ex.label" :label="ex.label" variant="link" size="sm" class="px-0" @click="useExample(ex.value)" />
      </div>
      <p class="text-xs text-muted">
        verifier.ton.org does not allow direct browser requests, so only the code hash passes through a small tonutils.io relay. Nothing else is sent or stored.
      </p>
    </form>

    <ErrorNotice v-if="error" :error="error" @retry="run" />
    <LoadingState v-else-if="loading" label="Reading code and asking verifier.ton.org…" />

    <template v-if="view">
      <UAlert
        :color="view.verified ? 'success' : 'neutral'"
        variant="subtle"
        :icon="view.verified ? 'i-lucide-badge-check' : 'i-lucide-circle-help'"
        :title="view.verified ? 'Verified source found' : 'No verified source'"
        :description="view.verified ? 'verifier.ton.org compiled these files and got exactly this code hash.' : view.reason"
      />

      <UAlert
        v-if="viaLibrary"
        color="info"
        variant="subtle"
        icon="i-lucide-library"
        title="Code is stored as a library"
        description="This contract's code is a library cell, so we looked up the library's hash (the real code hash) instead of the account's code hash."
      />

      <KeyValue
        :items="[
          { label: 'Code hash looked up', value: view.codeHash },
          ...(view.language ? [{ label: 'Compiler', value: `${view.language} ${view.version ?? ''}`.trim(), mono: false }] : []),
          ...(view.entrypoint ? [{ label: 'Entry file', value: view.entrypoint, copy: false }] : []),
          ...(view.verifiedAt ? [{ label: 'Verified', value: dateFmt(view.verifiedAt), mono: false, copy: false }] : []),
          ...(view.bundleHash ? [{ label: 'Source bundle hash', value: view.bundleHash }] : [])
        ]"
      />

      <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <ULink :to="verifierPageUrl(target)" target="_blank" rel="noopener" class="text-primary">
          Open on verifier.ton.org <UIcon name="i-lucide-external-link" class="size-3.5 align-[-2px]" />
        </ULink>
        <ULink v-if="target !== view.codeHash" :to="`/tools/contract-inspector?q=${encodeURIComponent(target)}`" class="text-primary">Inspect this contract</ULink>
      </div>
      <p v-if="isTestnet" class="text-xs text-muted">
        verifier.ton.org lists mainnet verifications. Code hashes are the same on every network, so testnet contracts with identical code still match.
      </p>

      <div v-if="view.files.length" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium text-highlighted">
            Source files ({{ view.files.length }})
          </h3>
          <USwitch v-if="stdlibCount" v-model="showStdlib" :label="`Show standard library (${stdlibCount})`" size="sm" @update:model-value="fileIdx = 0" />
        </div>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="(f, i) in visibleFiles"
            :key="f.path"
            :label="f.path"
            size="xs"
            :variant="file?.path === f.path ? 'solid' : 'soft'"
            :color="file?.path === f.path ? 'primary' : 'neutral'"
            class="font-mono"
            @click="fileIdx = i"
          />
        </div>
        <div v-if="file">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="truncate font-mono text-sm">{{ file.path }}<span v-if="file.path === view.entrypoint" class="text-muted"> · entry</span></span>
            <CopyButton :value="file.content" label="Copy file" />
          </div>
          <pre class="max-h-[32rem] overflow-auto rounded-md bg-elevated p-3 font-mono text-xs leading-relaxed [font-variant-ligatures:none]">{{ file.content }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>
