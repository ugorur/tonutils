<script setup lang="ts">
import type { Address } from '@ton/core'
import type { DecodedComment } from './logic'
import { parseBoc } from '~/utils/ton/messages'
import { ENCRYPTED_COMMENT } from '../payload-decoder/vectors'
import { buildComment, decodeComment, decryptComment, encryptComment, keysFromMnemonic, parsePublicKey, saltFor } from './logic'

const tab = ref('build')
const TABS = [
  { label: 'Build', value: 'build' },
  { label: 'Decode', value: 'decode' },
  { label: 'Encrypted', value: 'encrypted' }
]

// ---------------------------------------------------------------- build
const text = ref('')
const built = computed(() => (text.value ? buildComment(text.value) : null))

// ---------------------------------------------------------------- decode
const decodeInput = ref('')
const DECODE_EXAMPLES = [
  { label: 'Short comment', value: 'te6cckEBAQEADgAAGAAAAAA0ODY3MDgxN/jENZs=' },
  { label: 'Two-cell UTF-8 comment', value: 'te6cckEBAgEAwQAB/gAAAABAcGdvbiAtINC60YDQuNC/0YLQvi3RhNC40LDRgtC90YvQuSDQutC+0YjQtdC70LXQuiDQsiDQotCTLiDQn9C+0L/QvtC70L3QuCDQv9C+INCh0JHQnyAvINCy0YvQstC10LTQuCDQv9C+INCh0JHQnyAvINCe0L/Qu9ABAHqw0YLRiyBRUiDQsiDQvNCw0LPQsNC30LjQvdC1LiDQn9GA0L7QvNC+0LrQvtC0IC0gM0FCU0ExQkVSQUE4Dg7tIA==' },
  { label: 'Encrypted comment', value: ENCRYPTED_COMMENT }
]
const decoded = computed<{ ok: true, data: DecodedComment } | { ok: false, error: string } | null>(() => {
  if (!decodeInput.value.trim()) return null
  try {
    return { ok: true, data: decodeComment(decodeInput.value) }
  }
  catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})
function openDecrypt() {
  encBody.value = decodeInput.value
  encMode.value = 'decrypt'
  tab.value = 'encrypted'
}

// ---------------------------------------------------------------- encrypted
const encMode = ref<'decrypt' | 'encrypt'>('decrypt')
const ENC_MODES = [{ label: 'Decrypt', value: 'decrypt' }, { label: 'Encrypt', value: 'encrypt' }]
const phrase = ref('')
const showPhrase = ref(false)
const encBody = ref('')
const sender = ref('')
const senderAddr = shallowRef<Address | null>(null)
const plain = ref('')
const recipientKey = ref('')
const busy = ref(false)
const encError = ref<string | null>(null)
const decryptedText = ref<{ text: string, other: string } | null>(null)
const encryptedBoc = ref<string | null>(null)
watch([encMode, encBody, sender, phrase, plain, recipientKey], () => {
  encError.value = null
  decryptedText.value = null
  encryptedBoc.value = null
})

async function run() {
  encError.value = null
  busy.value = true
  try {
    if (!senderAddr.value) throw new Error(encMode.value === 'decrypt' ? 'Enter the address that sent the message' : 'Enter your wallet address (the sender)')
    const keys = await keysFromMnemonic(phrase.value)
    if (encMode.value === 'decrypt') {
      const r = await decryptComment({ body: parseBoc(encBody.value), keys, salts: [saltFor(senderAddr.value), saltFor(senderAddr.value, true)] })
      decryptedText.value = { text: r.text, other: Buffer.from(r.otherPublicKey).toString('hex') }
    }
    else {
      const cell = await encryptComment({ text: plain.value, keys, theirPublicKey: parsePublicKey(recipientKey.value), salt: saltFor(senderAddr.value) })
      encryptedBoc.value = cell.toBoc().toString('base64')
    }
  }
  catch (e) {
    encError.value = (e as Error).message
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UTabs v-model="tab" :items="TABS" :content="false" class="w-full" />

    <!-- ================================================================ BUILD -->
    <div v-if="tab === 'build'" class="space-y-4">
      <UFormField label="Comment text" hint="any UTF-8 text, emoji included">
        <UTextarea v-model="text" :rows="3" autoresize class="w-full" placeholder="e.g. Invoice 1042" />
      </UFormField>
      <UButton v-if="!text" label="Try an example" icon="i-lucide-sparkles" variant="link" size="sm" class="px-0" @click="text = 'Thanks for the coffee ☕'" />
      <template v-if="built">
        <KeyValue
          :items="[
            { label: 'Payload BOC (base64)', value: built.base64, hint: 'Use as TonConnect payload or the body of an internal message.' },
            { label: 'Payload BOC (hex)', value: built.hex },
            { label: 'Body hash', value: built.hash }
          ]"
        />
        <p class="text-sm text-muted">
          {{ built.bytes }} bytes of UTF-8 in {{ built.cells }} cell{{ built.cells === 1 ? '' : 's' }}: op <code class="font-mono">0x00000000</code>, then the text
          (123 bytes fit in the first cell, 127 in each next one). Comments are public: anyone can read them on chain.
        </p>
      </template>
    </div>

    <!-- ================================================================ DECODE -->
    <div v-else-if="tab === 'decode'" class="space-y-4">
      <BocInput v-model="decodeInput" label="Comment payload BOC" :examples="DECODE_EXAMPLES" />
      <UAlert v-if="decoded && !decoded.ok" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="decoded.error" />
      <template v-else-if="decoded?.ok">
        <div v-if="decoded.data.kind === 'text'" class="space-y-2 rounded-lg border border-default p-4">
          <div class="flex items-center justify-between gap-2">
            <UBadge label="Text comment" variant="subtle" />
            <CopyButton :value="decoded.data.text" label="Copy text" size="xs" />
          </div>
          <p class="whitespace-pre-wrap break-words text-highlighted">
            {{ decoded.data.text }}
          </p>
        </div>
        <UAlert
          v-else-if="decoded.data.kind === 'encrypted'"
          color="info"
          variant="subtle"
          icon="i-lucide-lock"
          title="Encrypted comment"
          :description="`${decoded.data.payloadBytes} bytes of ciphertext. Only the sender and the recipient can read it, with their recovery phrase.`"
          :actions="[{ label: 'Decrypt it', icon: 'i-lucide-lock-open', onClick: openDecrypt }]"
        />
        <UAlert
          v-else
          color="warning"
          variant="subtle"
          icon="i-lucide-info"
          :title="`Not a comment: ${decoded.data.title}${decoded.data.opHex ? ` (${decoded.data.opHex})` : ''}`"
          description="Open it in the message body decoder to see its fields."
          :actions="[{ label: 'Message body decoder', to: '/tools/payload-decoder' }]"
        />
      </template>
    </div>

    <!-- ================================================================ ENCRYPTED -->
    <div v-else class="space-y-4">
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="This needs your 24-word recovery phrase"
        description="It is used only inside this tab to derive your key and is never sent or stored. Still: only type it on a device you trust, and consider going offline first (this tool works without internet). Wallet apps such as Tonkeeper and MyTonWallet can show encrypted comments without exposing the phrase."
      />
      <URadioGroup v-model="encMode" :items="ENC_MODES" orientation="horizontal" />

      <template v-if="encMode === 'decrypt'">
        <UFormField label="Encrypted comment BOC" hint="the message body, op 0x2167da4b">
          <UTextarea v-model="encBody" :rows="3" autoresize class="w-full" :ui="{ base: 'font-mono text-xs break-all' }" placeholder="te6cck…" spellcheck="false" />
        </UFormField>
        <AddressInput v-model="sender" label="Sender address (the wallet that sent the message)" @parsed="senderAddr = $event" />
      </template>
      <template v-else>
        <UFormField label="Comment to encrypt">
          <UTextarea v-model="plain" :rows="2" autoresize class="w-full" />
        </UFormField>
        <AddressInput v-model="sender" label="Your wallet address (you are the sender)" @parsed="senderAddr = $event" />
        <UFormField label="Recipient public key" hint="64 hex characters, from the recipient wallet's get_public_key">
          <UInput v-model="recipientKey" class="w-full" :ui="{ base: 'font-mono text-xs' }" spellcheck="false" autocomplete="off" />
        </UFormField>
      </template>

      <UFormField :label="encMode === 'decrypt' ? 'Recovery phrase of the sender or the recipient' : 'Your recovery phrase'">
        <UInput
          v-model="phrase"
          :type="showPhrase ? 'text' : 'password'"
          class="w-full"
          placeholder="24 words separated by spaces"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :ui="{ base: 'font-mono text-xs' }"
        >
          <template #trailing>
            <UButton :icon="showPhrase ? 'i-lucide-eye-off' : 'i-lucide-eye'" variant="link" color="neutral" size="xs" :aria-label="showPhrase ? 'Hide phrase' : 'Show phrase'" @click="showPhrase = !showPhrase" />
          </template>
        </UInput>
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton :label="encMode === 'decrypt' ? 'Decrypt' : 'Encrypt'" :icon="encMode === 'decrypt' ? 'i-lucide-lock-open' : 'i-lucide-lock'" :loading="busy" @click="run" />
        <UButton v-if="phrase" label="Clear phrase" color="neutral" variant="ghost" @click="phrase = ''" />
      </div>

      <UAlert v-if="encError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="encError" />
      <div v-if="decryptedText" class="space-y-2 rounded-lg border border-default p-4">
        <div class="flex items-center justify-between gap-2">
          <UBadge label="Decrypted" color="success" variant="subtle" icon="i-lucide-lock-open" />
          <CopyButton :value="decryptedText.text" label="Copy text" size="xs" />
        </div>
        <p class="whitespace-pre-wrap break-words text-highlighted">
          {{ decryptedText.text }}
        </p>
        <ResultField label="Other party's public key" :value="decryptedText.other" />
      </div>
      <template v-if="encryptedBoc">
        <ResultField label="Encrypted comment BOC" :value="encryptedBoc" hint="Send it as the body (payload) of a transfer to the recipient, e.g. with the internal message builder." />
      </template>
    </div>
  </div>
</template>
