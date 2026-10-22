<script setup lang="ts">
// Shows the default slot only with a connected wallet on the site's network. Mandatory around wallet tools.
withDefaults(defineProps<{
  /** What the connection is for, e.g. "send jettons". */
  purpose?: string
}>(), { purpose: 'continue' })

const tc = useTonConnect()
const { network } = useTonNetwork()
const busy = ref(false)

async function connect() {
  busy.value = true
  try {
    await tc.connect()
  }
  catch (e) {
    useToast().add({ title: 'Could not open the wallet list', description: (e as Error).message, color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <template v-if="tc.wallet.value && !tc.networkMismatch.value">
      <slot :wallet="tc.wallet.value" />
    </template>

    <UAlert
      v-else-if="tc.wallet.value"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Wrong network"
      :description="`Your wallet is connected on ${tc.wallet.value.network ?? `chain ${tc.wallet.value.chain}`}, but TonUtils is set to ${network}. Switch the network in the header, or reconnect your wallet on ${network}.`"
      :actions="[{ label: 'Disconnect wallet', color: 'warning', variant: 'outline', onClick: () => tc.disconnect() }]"
    />

    <div v-else class="flex flex-col items-start gap-4 rounded-lg border border-dashed border-accented p-5 sm:flex-row sm:items-center">
      <div class="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <UIcon name="i-lucide-wallet" class="size-5" />
      </div>
      <div class="flex-1 text-sm">
        <p class="font-medium text-highlighted">
          Connect a wallet to {{ purpose }}
        </p>
        <p class="mt-1 text-muted">
          You approve every transaction in your own wallet app through TonConnect. TonUtils never sees your keys.
          Your wallet must be on <span class="font-medium capitalize text-default">{{ network }}</span>.
        </p>
      </div>
      <UButton icon="i-lucide-wallet" label="Connect wallet" :loading="busy" @click="connect" />
    </div>
  </div>
</template>
