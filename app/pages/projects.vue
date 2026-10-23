<script setup lang="ts">
import { projectCategories } from '~/data'

const route = useRoute()
const router = useRouter()

const q = ref('')
const category = ref('all')
const tag = ref('all')

const total = projectCategories.reduce((n, c) => n + c.projects.length, 0)

// Tags sorted by how many projects use them.
const tagCounts = new Map<string, number>()
for (const c of projectCategories) for (const p of c.projects) for (const t of p.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
const tagItems = [
  { label: 'All tags', value: 'all' },
  ...[...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t, n]) => ({ label: `${t} (${n})`, value: t }))
]

// The page is prerendered without a query, so read filters after hydration.
onMounted(() => {
  q.value = String(route.query.q ?? '')
  const c = String(route.query.category ?? '')
  if (projectCategories.some(x => x.id === c)) category.value = c
  const t = String(route.query.tag ?? '')
  if (tagCounts.has(t)) tag.value = t
})

// Keep filters in the URL so results can be shared.
watch([q, category, tag], () => {
  router.replace({
    query: {
      q: q.value || undefined,
      category: category.value === 'all' ? undefined : category.value,
      tag: tag.value === 'all' ? undefined : tag.value
    }
  })
})

const sections = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  return projectCategories
    .filter(c => category.value === 'all' || c.id === category.value)
    .map(c => ({
      ...c,
      projects: c.projects.filter((p) => {
        if (tag.value !== 'all' && !p.tags?.includes(tag.value)) return false
        const hay = `${p.name} ${p.description} ${p.url} ${c.title} ${(p.tags ?? []).join(' ')}`.toLowerCase()
        return words.every(w => hay.includes(w))
      })
    }))
    .filter(c => c.projects.length)
})
const count = computed(() => sections.value.reduce((n, c) => n + c.projects.length, 0))

const host = (url: string) => url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')

function clear() {
  q.value = ''
  category.value = 'all'
  tag.value = 'all'
}

useSeoMeta({
  title: 'Ecosystem projects',
  description: 'Wallets, DEXs, staking, NFT marketplaces, games, payments, explorers, APIs, developer tools and AI projects on TON. Search and filter by category or tag.'
})
</script>

<template>
  <div class="mx-auto max-w-(--ui-container) px-4 py-8 sm:px-6 sm:py-12">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      Ecosystem projects
    </h1>
    <p class="mt-2 max-w-2xl text-muted">
      {{ total }} well-known projects across TON, each link checked. A listing here is not an endorsement or financial advice: always do your own research.
    </p>

    <div class="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        placeholder="Search projects"
        size="lg"
        class="md:w-80"
        aria-label="Search projects"
      />
      <USelect v-model="tag" :items="tagItems" size="lg" class="md:w-64" aria-label="Tag" />
    </div>

    <nav class="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Categories">
      <UButton
        label="All"
        size="sm"
        :color="category === 'all' ? 'primary' : 'neutral'"
        :variant="category === 'all' ? 'solid' : 'outline'"
        class="shrink-0"
        :aria-pressed="category === 'all'"
        @click="category = 'all'"
      />
      <UButton
        v-for="c in projectCategories"
        :key="c.id"
        :label="c.title"
        :icon="c.icon"
        size="sm"
        :color="category === c.id ? 'primary' : 'neutral'"
        :variant="category === c.id ? 'solid' : 'outline'"
        class="shrink-0"
        :aria-pressed="category === c.id"
        @click="category = category === c.id ? 'all' : c.id"
      />
    </nav>

    <p class="mt-6 text-sm text-muted" aria-live="polite">
      {{ count }} {{ count === 1 ? 'project' : 'projects' }}
    </p>

    <div v-if="sections.length" class="mt-4 space-y-12">
      <section v-for="c in sections" :id="c.id" :key="c.id" :aria-labelledby="`${c.id}-h`">
        <h2 :id="`${c.id}-h`" class="flex items-center gap-2 font-display text-xl font-semibold text-highlighted">
          <UIcon :name="c.icon" class="size-5 text-primary" />{{ c.title }}
          <span class="text-sm font-normal text-dimmed">{{ c.projects.length }}</span>
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ c.description }}
        </p>
        <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="p in c.projects"
            :key="p.url"
            class="group relative flex flex-col rounded-lg border border-default p-4 transition-colors hover:border-primary/50"
          >
            <span class="flex items-start justify-between gap-2">
              <a
                :href="p.url"
                target="_blank"
                rel="noopener"
                class="font-medium text-highlighted after:absolute after:inset-0 group-hover:text-primary"
              >{{ p.name }}</a>
              <span class="flex shrink-0 items-center gap-1.5">
                <UBadge v-if="p.featured" label="Featured" icon="i-lucide-star" size="sm" variant="subtle" />
                <UIcon name="i-lucide-external-link" class="size-4 text-dimmed" />
              </span>
            </span>
            <span class="mt-1 block text-sm text-muted">{{ p.description }}</span>
            <span class="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
              <button
                v-for="t in p.tags"
                :key="t"
                type="button"
                class="relative z-10 rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-toned hover:bg-accented hover:text-highlighted"
                :aria-label="`Filter by tag ${t}`"
                @click="tag = t"
              >
                {{ t }}
              </button>
              <span class="ml-auto truncate font-mono text-xs text-dimmed">{{ host(p.url) }}</span>
            </span>
          </li>
        </ul>
      </section>
    </div>
    <div v-else class="mt-3 rounded-lg border border-dashed border-default p-10 text-center">
      <p class="text-highlighted">
        No project matches these filters.
      </p>
      <p class="mt-1 text-sm text-muted">
        Clear the filters, or
        <a href="https://github.com/ugorur/tonutils/issues/new" target="_blank" rel="noopener" class="text-primary underline-offset-2 hover:underline">suggest a project</a>.
      </p>
      <UButton class="mt-4" label="Clear filters" color="neutral" variant="outline" @click="clear" />
    </div>
  </div>
</template>
