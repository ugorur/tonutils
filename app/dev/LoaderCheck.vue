<script setup lang="ts">
import { loadFunc, loadJsQr, loadSandbox, loadTasm, loadTlbRuntime, loadTolk, loadUplot } from '~/utils/lazy'

// Dev-only smoke test for the lazy loaders (route /__dev/loaders, registered in nuxt.config.ts only in dev
// or with TONUTILS_DEV_PAGES=1). Every check runs the real library in this browser.
useSeoMeta({ title: 'Loader check', robots: 'noindex' })

// A mainnet wallet v4r2 (top-balance account) used as real contract state.
const WALLET = '0:CE3A368FE3CEECB5F93D137F267B62ECBAE9D1F7726D898DDD19F3D6394387F5'
const JETTON_BODY = 'te6cckEBAQEAVgAAqA+KfqUAAAAAAAAAAEARUZgIAZyon+SFNw0bobIF2Otmozk1N1Ol0tkGEXCm0+VoD1bvADd0QeLrEK7ga+edYRSEwsQGA2lwWmFDKof8DHlkMP6EQCktpPw='

type Status = { state: 'pending' | 'ok' | 'fail', detail: string, ms?: number }
const checks = reactive<Record<string, Status>>({})
const names = ['tasm', 'sandbox', 'tolk', 'func', 'tlb', 'jsqr', 'uplot'] as const
for (const n of names) checks[n] = { state: 'pending', detail: '' }
const chart = ref<HTMLElement>()
// Components that import @ton/core must load after the Buffer plugin, like Tool.vue does.
const ComponentPreview = defineAsyncComponent(() => import('./ComponentPreview.vue'))
const tc = useToncenter('mainnet')

async function run(name: typeof names[number], fn: () => Promise<string>) {
  const t = performance.now()
  try {
    checks[name] = { state: 'ok', detail: await fn(), ms: Math.round(performance.now() - t) }
  }
  catch (e) {
    checks[name] = { state: 'fail', detail: (e as Error).stack ?? String(e), ms: Math.round(performance.now() - t) }
  }
}

onMounted(async () => {
  const account = await tc.v3<{ code: string, data: string, balance: string }>('account', { address: WALLET })
  const wi = await tc.v3<{ seqno: number }>('walletInformation', { address: WALLET, use_v2: false })

  await Promise.all([
    run('tasm', async () => {
      const [{ Cell }, tasm] = await Promise.all([import('@ton/core'), loadTasm()])
      const text = tasm.text.print(tasm.runtime.decompileCell(Cell.fromBase64(account.code)))
      if (!text.includes('SETCP')) throw new Error('unexpected disassembly')
      return text.split('\n').slice(0, 6).join('\n') + `\n… (${text.split('\n').length} lines)`
    }),
    run('sandbox', async () => {
      const sb = await loadSandbox()
      const r = await sb.runGetMethod({ code: account.code, data: account.data, address: WALLET, method: 'seqno', balance: BigInt(account.balance) })
      const seqno = r.reader.readNumber()
      if (seqno !== wi.seqno) throw new Error(`seqno ${seqno} != toncenter ${wi.seqno}`)
      return `seqno() = ${seqno} (toncenter walletInformation: ${wi.seqno}), exit ${r.exitCode}, gas ${r.gasUsed}`
    }),
    run('tolk', async () => {
      const [tolk, sb] = await Promise.all([loadTolk(), loadSandbox()])
      const r = await tolk.compile({ 'main.tolk': 'fun onInternalMessage(in: InMessage) {}\n\nget fun hello(): int { return 42; }\n' }, 'main.tolk')
      if (r.status !== 'ok') throw new Error(r.message)
      const { beginCell } = await import('@ton/core')
      const g = await sb.runGetMethod({ code: r.codeBoc64, data: beginCell().endCell(), address: WALLET, method: 'hello' })
      return `Tolk ${r.tolkVersion}: code hash ${r.codeHashHex.slice(0, 16)}…, hello() = ${g.reader.readNumber()}`
    }),
    run('func', async () => {
      const [func, sb] = await Promise.all([loadFunc(), loadSandbox()])
      const r = await func.compile({ 'main.fc': '() recv_internal() impure { }\nint hello() method_id { return 42; }\n' }, ['main.fc'])
      if (r.status !== 'ok') throw new Error(r.message)
      const { beginCell } = await import('@ton/core')
      const g = await sb.runGetMethod({ code: r.codeBoc, data: beginCell().endCell(), address: WALLET, method: 'hello' })
      return `FunC ${(await func.version()).funcVersion}: hello() = ${g.reader.readNumber()}`
    }),
    run('tlb', async () => {
      const { parseTLB } = await loadTlbRuntime()
      // Schema from the tlb-runtime README (TEP-74) plus Either.
      const schema = `nothing$0 {X:Type} = Maybe X;
just$1 {X:Type} value:X = Maybe X;
left$0 {X:Type} {Y:Type} value:X = Either X Y;
right$1 {X:Type} {Y:Type} value:Y = Either X Y;
var_uint$_ {n:#} len:(#< n) value:(uint (len * 8)) = VarUInteger n;
addr_none$00 = MsgAddressExt;
addr_extern$01 len:(## 9) external_address:(bits len) = MsgAddressExt;
anycast_info$_ depth:(#<= 30) { depth >= 1 } rewrite_pfx:(bits depth) = Anycast;
addr_std$10 anycast:(Maybe Anycast) workchain_id:int8 address:bits256 = MsgAddressInt;
addr_var$11 anycast:(Maybe Anycast) addr_len:(## 9) workchain_id:int32 address:(bits addr_len) = MsgAddressInt;
_ _:MsgAddressInt = MsgAddress;
_ _:MsgAddressExt = MsgAddress;
transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress response_destination:MsgAddress custom_payload:(Maybe ^Cell) forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell) = InternalMsgBody;`
      const r = parseTLB(schema).deserialize(JETTON_BODY)
      if (!r.success) throw r.error
      const amount = String((r.value as { amount?: unknown }).amount)
      if (amount !== '18160000') throw new Error(`unexpected amount ${amount}`)
      return `jetton transfer amount = ${amount} (toncenter: 18160000)`
    }),
    run('jsqr', async () => {
      const [QR, jsQR] = await Promise.all([import('qrcode'), loadJsQr()])
      const canvas = document.createElement('canvas')
      await QR.toCanvas(canvas, 'ton://transfer/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', { margin: 2 })
      const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      const decoded = jsQR(img.data, img.width, img.height)?.data
      if (!decoded?.startsWith('ton://')) throw new Error('QR round trip failed')
      return decoded
    }),
    run('uplot', async () => {
      const uPlot = await loadUplot()
      const plot = new uPlot({ width: 300, height: 120, series: [{}, { stroke: '#0098EA' }] }, [[1, 2, 3, 4], [3, 1, 4, 1]], chart.value!)
      return `uPlot ${plot.root.className}`
    })
  ])
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-10">
    <h1 class="font-display text-2xl font-semibold text-highlighted">
      Lazy loader check
    </h1>
    <ul class="mt-6 space-y-3">
      <li v-for="(s, n) in checks" :key="n" class="rounded-lg border border-default p-3" :data-testid="`check-${n}`" :data-state="s.state">
        <div class="flex items-center gap-2">
          <UBadge :color="s.state === 'ok' ? 'success' : s.state === 'fail' ? 'error' : 'neutral'" :label="s.state" />
          <span class="font-mono text-sm">{{ n }}</span>
          <span v-if="s.ms !== undefined" class="text-xs text-muted">{{ s.ms }} ms</span>
        </div>
        <pre v-if="s.detail" class="mt-2 overflow-auto text-xs whitespace-pre-wrap">{{ s.detail }}</pre>
      </li>
    </ul>
    <div ref="chart" class="mt-6" />

    <h2 class="mt-10 font-display text-lg font-semibold text-highlighted">
      Wallet components
    </h2>
    <ClientOnly>
      <ComponentPreview @file="(d: string) => checks.file = { state: 'ok', detail: d }" />
    </ClientOnly>
  </div>
</template>
