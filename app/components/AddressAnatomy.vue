<script setup lang="ts">
// Static illustration: one account, five spellings. Values verified with toncenter detectAddress.
const rows = [
  { label: 'Bounceable', note: 'contracts', value: 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N' },
  { label: 'Non-bounceable', note: 'wallets', value: 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI' },
  { label: 'Testnet, bounceable', note: 'testnet', value: 'kQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqKYH' },
  { label: 'Testnet, non-bounceable', note: 'testnet', value: '0QCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqPvC' }
]
const raw = '0:83dfd552e63729b472fcbcc8c45ebcc6691702558b68ec7527e1ba403a0f31a8'
</script>

<template>
  <figure class="relative rounded-2xl border border-default bg-default/70 p-4 shadow-[0_30px_80px_-40px_var(--color-ton-500)] backdrop-blur sm:p-6">
    <figcaption class="flex items-baseline justify-between gap-3">
      <span class="font-display text-sm font-semibold text-highlighted">One account, five spellings</span>
      <span class="text-xs text-muted">same funds</span>
    </figcaption>

    <ul class="mt-4 space-y-3">
      <li v-for="r in rows" :key="r.value">
        <div class="flex items-baseline justify-between text-xs text-muted">
          <span>{{ r.label }}</span>
          <span class="text-dimmed">{{ r.note }}</span>
        </div>
        <div class="mt-1 font-mono text-[10.5px] leading-5 tracking-tight break-all sm:text-[13px]">
          <span class="rounded-sm bg-primary/15 px-0.5 font-semibold text-primary">{{ r.value.slice(0, 2) }}</span><span class="text-default">{{ r.value.slice(2, -3) }}</span><span class="rounded-sm bg-signal-500/15 px-0.5 font-semibold text-signal-500 dark:text-signal-400">{{ r.value.slice(-3) }}</span>
        </div>
      </li>
      <li class="border-t border-default pt-3">
        <div class="text-xs text-muted">
          Raw
        </div>
        <div class="mt-1 font-mono text-[10.5px] leading-5 break-all text-default sm:text-[13px]">
          <span class="rounded-sm bg-primary/15 px-0.5 font-semibold text-primary">0:</span>{{ raw.slice(2) }}
        </div>
      </li>
    </ul>

    <div class="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
      <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-primary" />flags and workchain</span>
      <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-signal-500" />checksum</span>
      <UButton to="/tools/address-converter" label="Convert your own" size="xs" variant="soft" class="ml-auto" />
    </div>
  </figure>
</template>
