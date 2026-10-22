<script setup lang="ts">
const emit = defineEmits<{ file: [detail: string] }>()
// Sample wallet request for the TxPreview/WalletGate preview below (real mainnet bodies).
const sampleMessages = [
  { address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', amount: 50_000_000n, payload: 'te6cckEBAgEAqQABqA+KfqVXmsSvjcxmVjB4JngBTdg67ucpRRKBuIYtLS8TjnVsBkgT+m95KZS+qgM5+1MAEP5ht//EKERK0Hq+MUWEwhr5Uwkx/9boz9sDhCZSrCwCAwEAoAAAAABNVy05YjdmZWFjOS1hMjdiLTRjNTktODgzNy01OGZmMDk1NWNjNDU6MmZlMTJlZTYtNWI0Ny00ZDdkLWE0ZWMtY2JiNTk4NGU5ZTc5MUpLMg==' },
  { address: '0:CE544FF2429B868DD0D902EC75B3519C9A9BA9D2E96C8308B85369F2B407AB77', amount: '1500000000' },
  { address: 'UQD4uGNdB4a3f52mYOZf0x1nCmdd1DAvrLppL0a1cetTYCQx', amount: 1n, payload: 'te6cckEBAQEAVgAAqA+KfqUAAAAAAAAAAEARUZgIAZyon+SFNw0bobIF2Otmozk1N1Ol0tkGEXCm0+VoD1bvADd0QeLrEK7ga+edYRSEwsQGA2lwWmFDKof8DHlkMP6EQCktpPw=', stateInit: 'te6cckEBAQEAVgAAqA+KfqUAAAAAAAAAAEARUZgIAZyon+SFNw0bobIF2Otmozk1N1Ol0tkGEXCm0+VoD1bvADd0QeLrEK7ga+edYRSEwsQGA2lwWmFDKof8DHlkMP6EQCktpPw=' }
]
</script>

<template>
  <div class="mt-4 space-y-6">
    <WalletGate purpose="preview the gate" />
    <TxPreview :messages="sampleMessages" />
    <div class="flex flex-wrap items-center gap-6">
      <QrCode value="ton://transfer/EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs?amount=1000000000" :size="140" />
      <div class="space-y-2">
        <AddressLink address="0:B113A994B5024A16719F69139328EB759596C38A25F59028B146FECDC3621DFE" />
        <TokenAmount :nano="492135n" :decimals="6" symbol="USD₮" />
        <CsvExportButton :rows="[{ a: 1n, b: 'x,y' }]" filename="sample" />
      </div>
    </div>
    <FileDrop text @file="f => emit('file', `${f.name} ${f.size} bytes`)" />
    <ErrorNotice :error="new TonApiError('rate', 'toncenter', 429, 'https://toncenter.com')" />
    <LoadingState label="Loading example…" />
  </div>
</template>
