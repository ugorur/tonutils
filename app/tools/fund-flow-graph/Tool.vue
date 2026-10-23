<script setup lang="ts">
import type { Address } from '@ton/core'
import { formatJettonAmount } from '~/utils/ton/jetton'
import type { GEdge, GNode, Graph } from './logic'
import { bounds, expand, flowsFromEvents, friendly, layout, loadEvents, newGraph, shortAddr } from './logic'

const EXAMPLE = { address: 'UQCIyU4WDsGc3jL_5y2bXrNKwiSyiSmyL12YLYQDnWvMRqYo', from: '2026-10-01', to: '2026-10-14' }
const MAX_EXPANSIONS = 30

const route = useRoute()
const api = useTonapi()
const { network, isTestnet } = useTonNetwork()

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const input = ref(typeof route.query.q === 'string' ? route.query.q : '')
const parsed = ref<Address | null>(null)
const fromDay = ref(iso(new Date(Date.now() - 90 * 86400_000)))
const toDay = ref(iso(new Date()))
const includeSpam = ref(false)

const graph = shallowRef<Graph | null>(null)
const expansions = ref(0)
const busy = ref<string | null>(null)
const error = ref<unknown>(null)
const selected = ref<string | null>(null)
const truncated = ref(new Set<string>())
const failed = ref<string | null>(null)
let session = 0

const range = computed(() => {
  const f = fromDay.value ? Math.floor(new Date(`${fromDay.value}T00:00`).getTime() / 1000) : undefined
  const t = toDay.value ? Math.floor(new Date(`${toDay.value}T00:00`).getTime() / 1000) + 86400 : undefined
  return { from: f, to: t && t > Date.now() / 1000 ? undefined : t }
})
const badRange = computed(() => !!fromDay.value && !!toDay.value && fromDay.value > toDay.value)

async function grow(g: Graph, address: string, my: number): Promise<Graph | null> {
  busy.value = address
  const { events, more } = await loadEvents(api.get, address, { ...range.value, maxPages: 2 })
  if (my !== session) return null
  if (more) truncated.value = new Set([...truncated.value, address])
  expansions.value++
  return layout(expand(g, address, flowsFromEvents(events, { includeSpam: includeSpam.value })))
}

async function start(rootAddr?: string) {
  const root = rootAddr ?? parsed.value?.toRawString().toLowerCase()
  if (!root || badRange.value) return
  const my = ++session
  error.value = null
  graph.value = null
  expansions.value = 0
  truncated.value = new Set()
  selected.value = root
  try {
    const g = await grow(newGraph(root), root, my)
    if (g) {
      graph.value = g
      fit()
    }
  }
  catch (e) {
    if (my === session) error.value = e
  }
  finally {
    if (my === session) busy.value = null
  }
}

async function expandNode(address: string) {
  if (!graph.value || busy.value || badRange.value || expansions.value >= MAX_EXPANSIONS) return
  const my = session
  error.value = null
  failed.value = null
  try {
    const g = await grow(graph.value, address, my)
    if (g) {
      graph.value = g
      fit()
    }
  }
  catch (e) {
    if (my === session) {
      error.value = e
      failed.value = address
    }
  }
  finally {
    if (my === session) busy.value = null
  }
}

function example() {
  input.value = EXAMPLE.address
  fromDay.value = EXAMPLE.from
  toDay.value = EXAMPLE.to
  nextTick(() => start())
}

watch(network, () => {
  session++
  graph.value = null
  busy.value = null
})
onMounted(() => {
  if (input.value) nextTick(() => start())
})

// ---------------------------------------------------------------- view (pan / zoom)
const view = reactive({ x: -100, y: -100, w: 200, h: 200 })
const svgEl = ref<SVGSVGElement | null>(null)
function fit() {
  if (!graph.value) return
  Object.assign(view, bounds(graph.value))
}
function zoom(f: number) {
  const cx = view.x + view.w / 2
  const cy = view.y + view.h / 2
  view.w *= f
  view.h *= f
  view.x = cx - view.w / 2
  view.y = cy - view.h / 2
}
let drag: { x: number, y: number, moved: boolean } | null = null
function down(e: PointerEvent) {
  drag = { x: e.clientX, y: e.clientY, moved: false }
}
function move(e: PointerEvent) {
  if (!drag || !svgEl.value) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  if (!drag.moved && Math.hypot(dx, dy) < 4) return
  if (!drag.moved) svgEl.value.setPointerCapture(e.pointerId)
  drag.moved = true
  const r = svgEl.value.getBoundingClientRect()
  const s = Math.max(view.w / r.width, view.h / r.height)
  view.x -= dx * s
  view.y -= dy * s
  drag.x = e.clientX
  drag.y = e.clientY
}
function up(e: PointerEvent) {
  const wasDrag = drag?.moved
  drag = null
  if (wasDrag) return
  const id = (e.target as Element).closest('[data-node]')?.getAttribute('data-node')
  selected.value = id ?? null
}

// ---------------------------------------------------------------- presentation
const nodes = computed(() => (graph.value ? [...graph.value.nodes.values()] : []))
const edges = computed(() => (graph.value ? [...graph.value.edges.values()] : []))
const sel = computed(() => (selected.value ? graph.value?.nodes.get(selected.value) ?? null : null))
const fr = (n: GNode) => friendly(n.address, n.wallet, isTestnet.value)
const label = (n: GNode) => {
  const s = n.name ?? shortAddr(fr(n))
  return s.length > 16 ? `${s.slice(0, 15)}…` : s
}
const fill = (n: GNode) => (n.scam ? 'var(--ui-error)' : n.address === graph.value?.root ? 'var(--ui-primary)' : n.name ? 'var(--ui-warning)' : n.wallet ? 'var(--ui-bg-accented)' : 'var(--ui-bg-inverted)')
const KIND_COLOR = { coin: 'var(--ui-primary)', jetton: 'var(--ui-success)', nft: 'var(--ui-text-muted)' }
const width = (e: GEdge) => 1 + Math.min(4, Math.log2(e.count))
const amountText = (e: GEdge) => {
  if (e.kind === 'nft') return `${e.count} NFT`
  // Dust (below 0.01) keeps all its decimals instead of showing as 0.
  const dust = e.amount < 10n ** BigInt(Math.max(0, e.decimals - 2))
  return `${formatJettonAmount(e.amount, e.decimals, { maxDecimals: dust ? e.decimals : 2 })} ${e.symbol}`
}

/** Line end points shortened to the node radius so arrowheads stay visible; reverse-direction pairs bend apart. */
function path(e: GEdge) {
  const a = graph.value!.nodes.get(e.from)!
  const b = graph.value!.nodes.get(e.to)!
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  const ra = a.address === graph.value!.root ? 20 : 14
  const rb = (b.address === graph.value!.root ? 20 : 14) + 4
  const x1 = a.x + (dx / d) * ra
  const y1 = a.y + (dy / d) * ra
  const x2 = b.x - (dx / d) * rb
  const y2 = b.y - (dy / d) * rb
  const bend = 12 + (e.kind === 'jetton' ? 10 : e.kind === 'nft' ? 20 : 0)
  const mx = (x1 + x2) / 2 - (dy / d) * bend
  const my = (y1 + y2) / 2 + (dx / d) * bend
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

const selEdges = computed(() => {
  const s = selected.value
  const list = s ? edges.value.filter(e => e.from === s || e.to === s) : edges.value
  return list.slice().sort((a, b) => b.count - a.count)
})
const nameOf = (addr: string) => {
  const n = graph.value?.nodes.get(addr)
  return n ? label(n) : shortAddr(addr)
}
const csvRows = computed<CsvRow[]>(() => edges.value.map((e) => {
  const a = graph.value!.nodes.get(e.from)!
  const b = graph.value!.nodes.get(e.to)!
  return {
    from: fr(a), from_label: a.name ?? '', to: fr(b), to_label: b.name ?? '',
    asset: e.symbol, asset_address: e.kind === 'jetton' ? e.asset : '', amount: e.kind === 'nft' ? String(e.count) : formatUnits(e.amount, e.decimals),
    transfers: e.count, first: new Date(e.first * 1000).toISOString(), last: new Date(e.last * 1000).toISOString()
  }
}))
const fmtDay = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-5">
    <form class="space-y-3" @submit.prevent="start()">
      <AddressInput v-model="input" label="Start from address" placeholder="UQ… / EQ… / 0:…" @parsed="parsed = $event" />
      <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <UFormField label="From">
          <UInput v-model="fromDay" type="date" class="w-full" />
        </UFormField>
        <UFormField label="To">
          <UInput v-model="toDay" type="date" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Build graph" icon="i-lucide-waypoints" :loading="!!busy && !graph" :disabled="!parsed || badRange" />
      </div>
      <p v-if="badRange" class="text-sm text-error">
        The end date must be on or after the start date.
      </p>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <USwitch v-model="includeSpam" label="Include events tonapi flags as spam" size="sm" />
        <UButton label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="example" />
      </div>
    </form>

    <LoadingState v-if="busy" :label="`Loading up to 200 events of ${shortAddr(busy)}…`" />
    <ErrorNotice :error="error" title="Could not load the flows" @retry="graph && failed ? expandNode(failed) : start()" />

    <template v-if="graph">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{{ nodes.length }} addresses · {{ edges.length }} flows · {{ expansions }}/{{ MAX_EXPANSIONS }} expansions</span>
        <div class="flex gap-1">
          <UButton icon="i-lucide-zoom-in" size="xs" color="neutral" variant="outline" aria-label="Zoom in" @click="zoom(0.8)" />
          <UButton icon="i-lucide-zoom-out" size="xs" color="neutral" variant="outline" aria-label="Zoom out" @click="zoom(1.25)" />
          <UButton icon="i-lucide-maximize" size="xs" color="neutral" variant="outline" aria-label="Fit to screen" @click="fit" />
        </div>
      </div>

      <svg
        ref="svgEl"
        :viewBox="`${view.x} ${view.y} ${view.w} ${view.h}`"
        class="h-[420px] w-full cursor-grab touch-none rounded-lg border border-default bg-elevated/30 select-none sm:h-[540px]"
        role="img"
        aria-label="Fund flow graph. The table below lists the same flows."
        data-testid="flow-graph"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
      >
        <defs>
          <marker v-for="(c, k) in KIND_COLOR" :id="`ffg-arrow-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" :fill="c" />
          </marker>
        </defs>
        <g>
          <path
            v-for="e in edges"
            :key="e.key"
            :d="path(e)"
            fill="none"
            :stroke="KIND_COLOR[e.kind]"
            :stroke-width="width(e)"
            :stroke-opacity="!selected || e.from === selected || e.to === selected ? 0.9 : 0.15"
            :marker-end="`url(#ffg-arrow-${e.kind})`"
          >
            <title>{{ nameOf(e.from) }} → {{ nameOf(e.to) }}: {{ amountText(e) }} ({{ e.count }}×)</title>
          </path>
        </g>
        <g>
          <g v-for="n in nodes" :key="n.address" :data-node="n.address" class="cursor-pointer" :transform="`translate(${n.x},${n.y})`">
            <circle
              :r="n.address === graph.root ? 20 : 14"
              :fill="fill(n)"
              :stroke="n.address === selected ? 'var(--ui-text-highlighted)' : n.expanded ? 'var(--ui-primary)' : 'var(--ui-border-accented)'"
              :stroke-width="n.address === selected ? 3 : n.expanded ? 2 : 1"
              :stroke-dasharray="n.expanded ? undefined : '3 2'"
            />
            <text :y="n.address === graph.root ? 34 : 28" text-anchor="middle" font-size="11" fill="var(--ui-text)" class="font-sans">{{ label(n) }}</text>
            <text v-if="n.scam" y="4" text-anchor="middle" font-size="11" font-weight="700" fill="white">!</text>
          </g>
        </g>
      </svg>

      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span class="flex items-center gap-1"><span class="size-3 rounded-full bg-primary" /> start</span>
        <span class="flex items-center gap-1"><span class="size-3 rounded-full bg-warning" /> named (exchange, DEX, service, domain)</span>
        <span class="flex items-center gap-1"><span class="size-3 rounded-full bg-error" /> flagged as scam</span>
        <span class="flex items-center gap-1"><span class="size-3 rounded-full bg-inverted" /> contract</span>
        <span class="flex items-center gap-1"><span class="size-3 rounded-full border border-dashed border-accented" /> not expanded yet</span>
        <span class="flex items-center gap-1"><span class="h-0.5 w-4 bg-primary" /> {{ COIN_SYMBOL }}</span>
        <span class="flex items-center gap-1"><span class="h-0.5 w-4 bg-success" /> jettons</span>
        <span>Drag to pan, tap a node to select it.</span>
      </div>

      <section v-if="sel" class="space-y-3 rounded-lg border border-default p-4" aria-labelledby="ffg-sel" data-testid="ffg-selected">
        <div class="flex flex-wrap items-center gap-2">
          <h3 id="ffg-sel" class="font-display text-sm font-semibold text-highlighted">
            {{ sel.name ?? 'Address' }}
          </h3>
          <UBadge v-if="sel.scam" color="error" variant="subtle" label="Flagged as scam" />
          <UBadge v-if="!sel.wallet" color="neutral" variant="subtle" label="Contract" />
          <UBadge color="neutral" variant="outline" :label="sel.hop ? `${sel.hop} hop${sel.hop > 1 ? 's' : ''} away` : 'Start'" />
        </div>
        <AddressLink :address="fr(sel)" full />
        <p v-if="sel.hidden" class="text-xs text-muted">
          {{ sel.hidden }} more counterparties with fewer transfers are not drawn.
        </p>
        <p v-if="truncated.has(sel.address)" class="text-xs text-warning">
          Busy address: only its latest 200 events in the date range were read.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!sel.expanded"
            label="Expand flows"
            icon="i-lucide-git-fork"
            size="sm"
            :loading="busy === sel.address"
            :disabled="!!busy || expansions >= MAX_EXPANSIONS"
            @click="expandNode(sel.address)"
          />
          <UButton v-if="sel.address !== graph.root" label="Start from here" icon="i-lucide-locate-fixed" size="sm" color="neutral" variant="outline" :disabled="!!busy" @click="input = fr(sel); start(sel.address)" />
        </div>
        <p v-if="expansions >= MAX_EXPANSIONS" class="text-xs text-muted">
          Expansion limit reached ({{ MAX_EXPANSIONS }}); keyless APIs allow about one request per second. Start from a node to continue there.
        </p>
      </section>

      <section class="space-y-2" aria-labelledby="ffg-flows">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 id="ffg-flows" class="font-display text-sm font-semibold text-highlighted">
            {{ sel ? `Flows of ${label(sel)}` : 'All flows' }} <span class="font-sans text-xs font-normal text-muted">({{ selEdges.length }})</span>
          </h3>
          <CsvExportButton :rows="csvRows" :filename="`fund-flows-${shortAddr(graph.root).replace('…', '-')}`" label="Export all flows" />
        </div>
        <ul class="divide-y divide-default text-sm">
          <li v-for="e in selEdges.slice(0, 50)" :key="e.key" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <span class="min-w-0">
              <button type="button" class="text-primary hover:underline" @click="selected = e.from">{{ nameOf(e.from) }}</button>
              <span class="text-muted"> → </span>
              <button type="button" class="text-primary hover:underline" @click="selected = e.to">{{ nameOf(e.to) }}</button>
            </span>
            <span class="font-mono text-xs whitespace-nowrap">{{ amountText(e) }} <span class="font-sans text-muted">· {{ e.count }}× · {{ fmtDay(e.last) }}</span></span>
          </li>
        </ul>
        <p v-if="!selEdges.length" class="text-sm text-muted">
          No transfers in this date range.
        </p>
      </section>
    </template>
  </div>
</template>
