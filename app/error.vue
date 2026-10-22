<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const is404 = computed(() => props.error.statusCode === 404)

useSeoMeta({ title: is404.value ? 'Page not found' : 'Something went wrong', robots: 'noindex' })
</script>

<template>
  <UApp>
    <NuxtLayout>
      <div class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <p class="font-mono text-sm text-primary">
          {{ error.statusCode }}
        </p>
        <h1 class="mt-3 font-display text-3xl font-semibold tracking-tight text-highlighted">
          {{ is404 ? 'This page does not exist' : 'Something went wrong' }}
        </h1>
        <p class="mt-3 text-muted">
          {{ is404 ? 'The link may be old, or the tool may have moved. Search for it or go back to the start.' : 'Reload the page. If it keeps happening, open an issue on GitHub.' }}
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <UButton label="Go to home" @click="clearError({ redirect: '/' })" />
          <UButton label="Browse all tools" to="/tools" color="neutral" variant="outline" />
        </div>
      </div>
    </NuxtLayout>
  </UApp>
</template>
