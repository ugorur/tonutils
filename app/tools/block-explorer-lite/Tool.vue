<script setup lang="ts">
import type { Address } from '@ton/core'
import type { V3Tx } from '~/lib/tx-dev/txview'
import { txHashHex } from '~/utils/ton/explorers'
import { accountBits, age, shardHex, parseSeqno, shardCoverage, shardLabel, shardOf, shardPrefix, type V3Block } from './logic'

const TX_PAGE = 100

const seqInput = ref('')
const seqno = ref<number | null>(null)
const latest = ref<number | null>(null)
const blocks = ref<V3Block[]>([])
const shardState = ref<{ workchain: number, shard: string, seqno: number }[] | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)

const txs = ref<V3Tx[]>([])
const txLoading = ref(false)
const txError = ref<unknown>(null)
const txDone = ref(false)

const addr = ref('')
const parsedAddr = ref<Address | null>(null)

const route = useRoute()
const { network } = useTonNetwork()
const tc = useToncenter()
const now = ref(Date.now() / 1000)

async function load(target?: number) {
  error.value = null
  loading.value = true
  txs.value = []
  txDone.value = false
  txError.value = null
  try {
    if (!target) {
      const info = await tc.v3<{ last: V3Block }>('masterchainInfo')
      latest.value = info.last.seqno
      target = info.last.seqno
    }
    const res = await tc.v3<{ blocks: V3Block[] }>('masterchainBlockShards', { seqno: target })
    if (!res.blocks.length) throw new Error(`Masterchain block ${target} was not found on ${network.value}.`)
    blocks.value = res.blocks
    seqno.value = target
    seqInput.value = String(target)
    now.value = Date.now() / 1000
    // Full shard layout (every shard, not only those that made a block here), from the liteserver.
    shardState.value = null
    const res2 = await tc.v2<{ shards: { workchain: number, shard: string, seqno: number }[] }>('getShards', { seqno: target })
    shardState.value = res2.shards.map(x => ({ workchain: x.workchain, shard: shardHex(x.shard), seqno: x.seqno }))
  }
  catch (e) {
    if (!blocks.value.length || seqno.value !== target) error.value = e
  }
  finally {
    loading.value = false
  }
}

function go() {
  const n = parseSeqno(seqInput.value)
  if (!n) {
    error.value = new Error('Enter a masterchain block number (seqno), e.g. 40000000.')
    return
  }
  load(n)
}

async function loadTxs() {
  if (!seqno.value) return
  txLoading.value = true
  txError.value = null
  try {
    const r = await tc.v3<{ transactions: V3Tx[] }>('transactionsByMasterchainBlock', { seqno: seqno.value, limit: TX_PAGE, offset: txs.value.length, sort: 'asc' })
    txs.value.push(...r.transactions)
    txDone.value = r.transactions.length < TX_PAGE
  }
  catch (e) {
    txError.value = e
  }
  finally {
    txLoading.value = false
  }
}

onMounted(() => {
  const q = typeof route.query.seqno === 'string' ? parseSeqno(route.query.seqno) : null
  load(q ?? undefined)
})
watch(network, () => {
  latest.value = null
  load()
})

const master = computed(() => blocks.value.find(b => b.workchain === -1) ?? null)
const shardBlocks = computed(() => blocks.value.filter(b => b.workchain !== -1))
const layout = computed(() => (shardState.value ?? shardBlocks.value).filter(b => b.workchain !== -1).sort((a, b) => shardPrefix(a.shard).bits.localeCompare(shardPrefix(b.shard).bits)))
const totalTx = computed(() => blocks.value.reduce((s, b) => s + b.tx_count, 0))

const flags = (b: V3Block) => [
  b.key_block && 'key block',
  b.before_split && 'about to split',
  b.after_split && 'just split',
  b.after_merge && 'just merged',
  // the masterchain is never split or merged; toncenter still reports want_merge = true for it
  b.workchain !== -1 && b.want_split && 'wants split',
  b.workchain !== -1 && b.want_merge && 'wants merge'
].filter(Boolean) as string[]

const time = (b: V3Block) => new Date(Number(b.gen_utime) * 1000).toLocaleString()

const found = computed(() => {
  const a = parsedAddr.value
  if (!a || !layout.value.length) return null
  const raw = a.toRawString()
  const hex = raw.split(':')[1]!
  const shard = a.workChain === -1 ? null : shardOf(raw, layout.value)
  return { raw, wc: a.workChain, bits8: accountBits(hex, 8), shard }
})
</script>

<template>
  <div class="space-y-6">
    <form class="flex flex-col gap-2 sm:flex-row sm:items-end" @submit.prevent="go">
      <UFormField label="Masterchain block (seqno)" class="w-full">
        <UInput v-model="seqInput" inputmode="numeric" placeholder="e.g. 40000000" size="lg" class="w-full" :ui="{ base: 'font-mono' }" />
      </UFormField>
      <div class="flex gap-2">
        <UButton type="submit" label="Open" icon="i-lucide-search" size="lg" :loading="loading" class="flex-1 justify-center sm:flex-none" />
        <UButton label="Latest" icon="i-lucide-refresh-cw" size="lg" color="neutral" variant="outline" :disabled="loading" class="flex-1 justify-center sm:flex-none" @click="load()" />
      </div>
    </form>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span class="text-muted">Try:</span>
      <UButton label="Block 40000000 (9 shards, 2024)" variant="link" size="sm" class="px-0" @click="load(40000000)" />
    </div>

    <LoadingState v-if="loading && !blocks.length" label="Reading blocks from toncenter…" />
    <ErrorNotice :error="error" @retry="seqno ? load(seqno) : load()" />

    <template v-if="master && seqno">
      <section aria-label="Masterchain block" class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-base font-semibold text-highlighted">
            Masterchain block {{ seqno.toLocaleString() }}
          </h3>
          <div class="flex gap-1">
            <UButton icon="i-lucide-chevron-left" label="Prev" size="sm" color="neutral" variant="outline" :disabled="loading || seqno <= 1" @click="load(seqno - 1)" />
            <UButton trailing-icon="i-lucide-chevron-right" label="Next" size="sm" color="neutral" variant="outline" :disabled="loading || (latest !== null && seqno >= latest)" @click="load(seqno + 1)" />
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge v-if="latest === seqno" color="success" variant="subtle" label="Latest" />
          <UBadge v-for="f in flags(master)" :key="f" color="warning" variant="subtle" :label="f" />
          <UBadge color="neutral" variant="outline" :label="`${totalTx} transactions in this block and its shard blocks`" />
        </div>
        <div class="grid gap-x-6 sm:grid-cols-2">
          <ResultField label="Created" :value="time(master)" :mono="false" :copy="false" :hint="age(Number(master.gen_utime), now)" />
          <ResultField label="Masterchain transactions" :value="String(master.tx_count)" :copy="false" />
          <ResultField label="Logical time range" :value="`${master.start_lt} – ${master.end_lt}`" :copy="false" />
          <ResultField label="Previous key block" :value="String(master.prev_key_block_seqno)" :copy="false" />
          <ResultField label="Root hash" :value="master.root_hash" hint="base64" />
          <ResultField label="File hash" :value="master.file_hash" hint="base64" />
        </div>
      </section>

      <section aria-label="Shard blocks" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Shard blocks committed in this block ({{ shardBlocks.length }})
        </h3>
        <p v-if="!shardBlocks.length" class="text-sm text-muted">
          No new shard blocks were committed in this masterchain block.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <div v-for="b in shardBlocks" :key="`${b.shard}-${b.seqno}`" class="rounded-lg border border-default p-3 text-sm">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="font-mono font-medium text-highlighted">{{ shardLabel(b.workchain, b.shard) }}</span>
              <span class="text-muted">#{{ b.seqno.toLocaleString() }}</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
              <span><span class="text-highlighted">{{ b.tx_count }}</span> tx</span>
              <span class="font-mono text-xs">shard {{ b.shard }}</span>
              <span>{{ age(Number(b.gen_utime), now) }}</span>
            </div>
            <div v-if="flags(b).length" class="mt-2 flex flex-wrap gap-1">
              <UBadge v-for="f in flags(b)" :key="f" color="warning" variant="subtle" size="sm" :label="f" />
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Shard layout" class="space-y-2">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Basechain shard layout ({{ layout.length }} shard{{ layout.length === 1 ? '' : 's' }})
        </h3>
        <p class="text-xs text-dimmed">
          A shard holds every account whose address starts with its prefix bits. {{ shardState ? 'Full layout at this block.' : 'Only shards that produced a block here (the full layout could not be loaded for this block).' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <span v-for="b in layout" :key="b.shard" class="rounded-md border border-default px-2 py-1 font-mono text-xs">
            {{ shardLabel(b.workchain, b.shard) }} <span class="text-muted">· {{ +(shardCoverage(b.shard) * 100).toFixed(2) }}% of addresses</span>
          </span>
        </div>
      </section>

      <section aria-label="Find the shard of an address" class="space-y-3 rounded-lg border border-default p-3 sm:p-4">
        <h3 class="font-display text-sm font-semibold text-highlighted">
          Which shard is my address in?
        </h3>
        <AddressInput v-model="addr" label="Address" @parsed="a => (parsedAddr = a)" />
        <div v-if="found" class="space-y-1 text-sm">
          <p v-if="found.wc === -1" class="text-muted">
            This is a masterchain address: the masterchain is never split.
          </p>
          <template v-else>
            <p>
              Shard at block {{ seqno.toLocaleString() }}:
              <span class="font-mono font-medium text-highlighted">{{ found.shard ? shardLabel(found.shard.workchain, found.shard.shard) : 'not found in this layout' }}</span>
              <span v-if="found.shard" class="text-muted"> (id {{ found.shard.shard }}, prefix depth {{ shardPrefix(found.shard.shard).depth }})</span>
            </p>
            <p class="text-muted">
              First address bits: <span class="font-mono text-highlighted">{{ found.bits8 }}…</span>.
              Jetton 2.0 wallets (ton-blockchain/jetton-contract, jetton-2.0 branch, SHARD_DEPTH = 8) are deployed at an address that starts with the same 8 bits as their owner's, so a wallet and its owner stay in the same shard (at any split depth up to 8) and messages between them do not cross shards.
            </p>
          </template>
        </div>
      </section>

      <section aria-label="Transactions" class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-display text-sm font-semibold text-highlighted">
            Transactions{{ txs.length ? ` (${txs.length}${txDone ? '' : '+'})` : '' }}
          </h3>
          <UButton v-if="!txs.length" label="List transactions" icon="i-lucide-list-tree" size="sm" color="neutral" variant="outline" :loading="txLoading" :disabled="!totalTx" @click="loadTxs" />
        </div>
        <ErrorNotice :error="txError" @retry="loadTxs" />
        <ul v-if="txs.length" class="divide-y divide-default rounded-lg border border-default">
          <li v-for="t in txs" :key="t.hash" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <div class="flex min-w-0 items-center gap-2">
              <span class="font-mono text-xs text-muted">{{ t.block_ref ? shardLabel(t.block_ref.workchain, t.block_ref.shard) : '' }}</span>
              <AddressLink :address="t.account" no-links />
            </div>
            <ULink :to="`/tools/transaction-decoder?q=${txHashHex(t.hash)}`" class="font-mono text-xs text-primary">
              {{ txHashHex(t.hash).slice(0, 10) }}… decode
            </ULink>
          </li>
        </ul>
        <UButton v-if="txs.length && !txDone" label="Load more" size="sm" color="neutral" variant="outline" :loading="txLoading" @click="loadTxs" />
      </section>
    </template>
  </div>
</template>
