<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const q = ref('')
const category = ref<CategoryId | 'all'>('all')
const audience = ref<'all' | 'user' | 'dev'>('all')

// The page is prerendered without a query, so read filters after hydration.
onMounted(() => {
  q.value = String(route.query.q ?? '')
  const c = String(route.query.category ?? '')
  if (isCategoryId(c)) category.value = c
  audience.value = (['user', 'dev'] as const).find(a => a === route.query.for) ?? 'all'
})

// Keep filters in the URL so results can be shared.
watch([q, category, audience], () => {
  router.replace({
    query: {
      q: q.value || undefined,
      category: category.value === 'all' ? undefined : category.value,
      for: audience.value === 'all' ? undefined : audience.value
    }
  })
})

const results = computed(() => {
  let list = toolRegistry
  if (category.value !== 'all') list = list.filter(t => t.category === category.value)
  if (audience.value !== 'all') list = list.filter(t => t.audience === audience.value || t.audience === 'both')
  return searchTools(q.value, list)
})

const categoryItems = computed(() => [
  { label: `All categories (${toolRegistry.length})`, value: 'all' },
  ...CATEGORY_IDS.map(id => ({ label: `${CATEGORIES[id].name} (${toolsInCategory(id).length})`, value: id }))
])

useSeoMeta({
  title: 'All tools',
  description: 'Every TON tool on TonUtils: addresses, wallets and keys, units, cells, jettons, NFTs, DNS and developer helpers. Filter by category or audience.'
})
</script>

<template>
  <div class="mx-auto max-w-(--ui-container) px-4 py-8 sm:px-6 sm:py-12">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      All tools
    </h1>
    <p class="mt-2 max-w-2xl text-muted">
      {{ toolRegistry.length }} tools, all free. Filter by what you are doing or who you are.
    </p>

    <div class="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Filter tools"
        size="lg"
        class="md:w-80"
        aria-label="Filter tools by text"
      />
      <USelect v-model="category" :items="categoryItems" size="lg" class="md:w-72" aria-label="Category" />
      <UTabs
        v-model="audience"
        :content="false"
        :items="[{ label: 'Everyone', value: 'all' }, { label: 'Users', value: 'user' }, { label: 'Developers', value: 'dev' }]"
        size="md"
        class="md:ml-auto"
      />
    </div>

    <p class="mt-6 text-sm text-muted" aria-live="polite">
      {{ results.length }} {{ results.length === 1 ? 'tool' : 'tools' }}
    </p>
    <div v-if="results.length" class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ToolCard v-for="t in results" :key="t.slug" :tool="t" />
    </div>
    <div v-else class="mt-3 rounded-lg border border-dashed border-default p-10 text-center">
      <p class="text-highlighted">
        No tool matches these filters.
      </p>
      <p class="mt-1 text-sm text-muted">
        Clear the filters, or
        <a href="https://github.com/ugorur/tonutils/issues/new" target="_blank" rel="noopener" class="text-primary underline-offset-2 hover:underline">suggest the tool you need</a>.
      </p>
      <UButton class="mt-4" label="Clear filters" color="neutral" variant="outline" @click="q = ''; category = 'all'; audience = 'all'" />
    </div>
  </div>
</template>
