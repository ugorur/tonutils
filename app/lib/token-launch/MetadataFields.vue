<script setup lang="ts">
import type { MetadataErrors, MetadataForm } from './jetton-minter'

// Token name / symbol / decimals / logo / description, or a metadata JSON link. Used by the deployer and the admin panel.
const form = defineModel<MetadataForm>({ required: true })
const props = withDefaults(defineProps<{
  errors: MetadataErrors
  /** The minter only stores a URL (Jetton 2.0 / stablecoin). */
  uriOnly?: boolean
}>(), { uriOnly: false })

const touched = ref(new Set<string>())
const err = (k: keyof MetadataForm) => (touched.value.has(k) ? props.errors[k] : undefined)
function touch(k: string) {
  touched.value = new Set(touched.value).add(k)
}
/** Shows every error, e.g. when the user presses the main button. */
function touchAll() {
  touched.value = new Set(['name', 'symbol', 'decimals', 'description', 'image', 'uri', 'supply'])
}
defineExpose({ touchAll })

const imageOk = ref(true)
watch(() => form.value.image, () => (imageOk.value = true))
const offchain = computed(() => props.uriOnly || form.value.mode === 'offchain')
</script>

<template>
  <div class="space-y-4">
    <UTabs
      v-if="!uriOnly"
      v-model="form.mode"
      :content="false"
      size="sm"
      :items="[{ label: 'Stored on-chain (no hosting)', value: 'onchain' }, { label: 'Metadata JSON link', value: 'offchain' }]"
    />

    <template v-if="!offchain">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Name" :error="err('name')" help="Shown in wallets, e.g. My Token">
          <UInput v-model="form.name" class="w-full" placeholder="My Token" maxlength="64" @blur="touch('name')" />
        </UFormField>
        <UFormField label="Symbol" :error="err('symbol')" help="Short ticker, e.g. MYT">
          <UInput v-model="form.symbol" class="w-full" placeholder="MYT" maxlength="16" autocapitalize="characters" @blur="touch('symbol')" />
        </UFormField>
      </div>
      <div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <UFormField label="Logo URL (optional)" :error="err('image')" help="A direct https:// link to a square PNG, JPG, WEBP or SVG (256×256 or larger).">
          <UInput v-model="form.image" class="w-full" placeholder="https://…/logo.png" inputmode="url" autocapitalize="off" spellcheck="false" @blur="touch('image')" />
        </UFormField>
        <div v-if="form.image && !errors.image" class="grid size-16 place-items-center overflow-hidden rounded-full border border-default bg-elevated">
          <img v-if="imageOk" :src="form.image" alt="Logo preview" class="size-full object-cover" referrerpolicy="no-referrer" @error="imageOk = false">
          <UIcon v-else name="i-lucide-image" class="size-6 text-error" :title="'This link did not load as an image'" />
        </div>
      </div>
      <p v-if="form.image && !imageOk" class="-mt-2 text-xs text-warning">
        This link does not load as an image here. Wallets will not show it either: use a direct link to the image file.
      </p>
      <UFormField label="Description (optional)" :error="err('description')">
        <UTextarea v-model="form.description" class="w-full" :rows="2" autoresize :maxrows="6" placeholder="What is this token for?" @blur="touch('description')" />
      </UFormField>
    </template>

    <template v-else>
      <UFormField label="Metadata JSON URL" :error="err('uri')">
        <UInput v-model="form.uri" class="w-full font-mono" placeholder="https://example.com/jetton.json" inputmode="url" autocapitalize="off" spellcheck="false" @blur="touch('uri')" />
        <template #help>
          A file you host (your site, GitHub, IPFS) with TEP-64 fields:
          <code class="font-mono text-xs">{"name": "My Token", "symbol": "MYT", "decimals": "9", "image": "https://…/logo.png", "description": "…"}</code>.
          You can change the file later without a transaction.<template v-if="uriOnly"> This minter type only stores a link, so the decimals are fixed by the contract.</template>
        </template>
      </UFormField>
    </template>

    <UFormField v-if="!uriOnly" label="Decimals" :error="err('decimals')" class="max-w-48" :help="offchain ? 'Must match \'decimals\' in your JSON file (9 if it has none).' : '9 like GRAM, or 6 like USD₮. Wallets divide balances by 10^decimals.'">
      <UInput v-model="form.decimals" class="w-full" inputmode="numeric" @blur="touch('decimals')" />
    </UFormField>
  </div>
</template>
