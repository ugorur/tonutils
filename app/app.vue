<script setup lang="ts">
const siteUrl = useRuntimeConfig().public.siteUrl
const route = useRoute()

useHead({
  titleTemplate: t => (t && t !== 'TonUtils' ? `${t} · TonUtils` : 'TonUtils: free TON blockchain tools'),
  link: [{ rel: 'canonical', href: () => siteUrl + (route.path === '/' ? '' : route.path) }]
})

useSeoMeta({
  ogSiteName: 'TonUtils',
  ogType: 'website',
  ogUrl: () => siteUrl + route.path,
  ogImage: `${siteUrl}/og.png`,
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp :tooltip="{ delayDuration: 200 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
