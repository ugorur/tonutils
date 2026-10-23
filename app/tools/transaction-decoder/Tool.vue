<script setup lang="ts">
import TxDetails from '~/lib/tx-dev/TxDetails.vue'
import { decodeTransaction, type DecodeResult } from './logic'

// Real mainnet transactions (checked on toncenter v3).
const EXAMPLES = [
  { label: 'Wallet sends USD₮', value: '260d3e319c18c6cafbe4aee338472f73dd34b810dc61004ee6b1b8a1643caa44' },
  { label: 'Failed (exit code 9)', value: '5b1b6a757d46d3db4c306164c8c29f8e27f16c543ed62623aa8501b50101128f' },
  { label: 'Bounced', value: '4666628786f6521727b5d05a4dcc4410fc65c3ec977150056f4de2c5d41b33e1' },
  // raw BOC of the "Failed" transaction above (toncenter v2 getTransactions)
  { label: 'Raw BOC', value: 'te6cckECBwEAAWUAA7V7ETqZS1AkoWcZ9pE5Mo63WVlsOKJfWQKLFG/s3DYh3+AABlj2sQ7OQsOkeJHDjddWakuNdrPOVtvzIaR1+gjYbl+eqoLkfTFwAAZYpmpUeHatot5QABRgIcfoAQIDAQGgBACCci9Oafa8bnt6Wm2EKmjxIyOdXk1i7Tjr1vMZWjOJAivkxV9UPGv14mipA0zwEGpNgLsdQryCOUNjY1jAvPFwAcEBGQyAgMkO5rKAEGAhh4kGAa9IAcLfo8b5Cr2iv0N057qUJ+BlXWQqv57LsTDaMUws1nnxACxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id/kO5rKAAFffQAAMse1iHZxtW0W8rABQAAAJ5AgMw9CQAAAAAAEgAAABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfynneg==' }
]

const input = ref('')
const loading = ref(false)
const error = ref<unknown>(null)
const result = ref<DecodeResult | null>(null)
const showRaw = ref(false)

const route = useRoute()
const { network } = useTonNetwork()
const tc = useToncenter()

async function run() {
  error.value = null
  result.value = null
  showRaw.value = false
  loading.value = true
  try {
    result.value = await decodeTransaction(input.value, tc, network.value)
  }
  catch (e) {
    error.value = e
  }
  finally {
    loading.value = false
  }
}

function example(v: string) {
  input.value = v
  run()
}

// Deep links from other tools: /tools/transaction-decoder?q=<hash>
onMounted(() => {
  const q = route.query.q
  if (typeof q === 'string' && q) example(q)
})

watch(network, () => {
  if (result.value?.source === 'toncenter') run()
})

const sourceNote = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.source === 'boc') return 'Parsed locally from the BOC you pasted. Nothing was sent anywhere.'
  if (r.verified === true) return 'Indexed data from toncenter. The raw transaction BOC was fetched too and our local parse gives the same hash.'
  if (r.verified === false) return 'Indexed data from toncenter. Warning: the raw BOC hash does not match the indexer.'
  return 'Indexed data from toncenter (the raw BOC could not be fetched for this transaction).'
})
</script>

<template>
  <div class="space-y-6">
    <form class="space-y-2" @submit.prevent="run">
      <UFormField label="Transaction hash, explorer link or raw transaction BOC" hint="Hex, base64 or a te6cc… BOC">
        <UTextarea
          v-model="input"
          :rows="3"
          autoresize
          :maxrows="8"
          placeholder="260d3e31…, https://tonviewer.com/transaction/…, or te6cckEC…"
          class="w-full"
          :ui="{ base: 'font-mono text-sm break-all' }"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown.enter.exact.prevent="run"
        />
      </UFormField>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="text-muted">Try:</span>
          <UButton v-for="e in EXAMPLES" :key="e.label" :label="e.label" variant="link" size="sm" class="px-0" @click="example(e.value)" />
        </div>
        <UButton type="submit" label="Decode" icon="i-lucide-file-search" size="lg" :loading="loading" :disabled="!input.trim()" class="justify-center" />
      </div>
      <p class="text-xs text-dimmed">
        A message hash works too: the transaction that received it is shown. BOCs are decoded in your browser; hashes are looked up on toncenter ({{ network }}).
      </p>
    </form>

    <LoadingState v-if="loading" label="Looking the transaction up on toncenter…" />
    <ErrorNotice :error="error" title="Could not decode" @retry="run" />

    <template v-if="result && !loading">
      <UAlert
        :color="result.verified === false ? 'warning' : 'neutral'"
        variant="subtle"
        :icon="result.source === 'boc' ? 'i-lucide-shield-check' : result.verified ? 'i-lucide-badge-check' : 'i-lucide-info'"
        :description="sourceNote"
      />
      <UAlert
        v-if="result.viaMessage"
        color="primary"
        variant="subtle"
        icon="i-lucide-info"
        description="The hash you pasted is the hash of the inbound message. This is the transaction that processed it."
      />

      <div class="flex flex-wrap gap-2">
        <UButton
          :to="`/tools/tx-retracer?q=${result.view.hashHex}`"
          label="Re-trace step by step"
          icon="i-lucide-footprints"
          color="neutral"
          variant="outline"
          size="sm"
        />
        <UButton
          v-if="result.mcSeqno"
          :to="`/tools/block-explorer-lite?seqno=${result.mcSeqno}`"
          :label="`Masterchain block ${result.mcSeqno}`"
          icon="i-lucide-blocks"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>

      <TxDetails :tx="result.view" :wallet-version="result.walletVersion" />

      <div v-if="result.raw" class="space-y-2">
        <UButton
          :label="showRaw ? 'Hide raw transaction BOC' : 'Show raw transaction BOC'"
          :icon="showRaw ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="showRaw = !showRaw"
        />
        <ResultField v-if="showRaw" label="Transaction BOC (base64)" :value="result.raw" hint="Paste it into the Cell tree viewer or BOC converter to inspect the cells." />
      </div>
    </template>
  </div>
</template>
