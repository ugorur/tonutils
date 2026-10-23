<script setup lang="ts">
import { linkCategories } from '~/data'

const route = useRoute()
const router = useRouter()

const q = ref('')
const category = ref('all')
const tag = ref('')
const results = useTemplateRef<HTMLElement>('results')

const total = linkCategories.reduce((n, c) => n + c.links.length, 0)
const knownTags = new Set(linkCategories.flatMap(c => c.links.flatMap(l => l.tags ?? [])))

// The page is prerendered without a query, so read filters after hydration.
onMounted(() => {
  q.value = String(route.query.q ?? '')
  const c = String(route.query.category ?? '')
  if (linkCategories.some(x => x.id === c)) category.value = c
  const t = String(route.query.tag ?? '')
  if (knownTags.has(t)) tag.value = t
})

// Keep filters in the URL so a filtered view can be shared.
watch([q, category, tag], () => {
  router.replace({
    query: {
      q: q.value || undefined,
      category: category.value === 'all' ? undefined : category.value,
      tag: tag.value || undefined
    }
  })
})

const sections = computed(() => {
  const words = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  return linkCategories
    .filter(c => category.value === 'all' || c.id === category.value)
    .map(c => ({
      ...c,
      links: c.links.filter((l) => {
        if (tag.value && !l.tags?.includes(tag.value)) return false
        const hay = `${l.title} ${l.description} ${l.url} ${c.title} ${(l.tags ?? []).join(' ')}`.toLowerCase()
        return words.every(w => hay.includes(w))
      })
    }))
    .filter(c => c.links.length)
})
const count = computed(() => sections.value.reduce((n, c) => n + c.links.length, 0))

const host = (url: string) => url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')
// A plain icon by kind of site instead of a favicon: no request to the linked site or a favicon service.
function kindIcon(url: string) {
  const h = host(url)
  if (h.startsWith('github.com/')) return 'i-lucide-github'
  if (h.startsWith('t.me/')) return 'i-lucide-send'
  if (h.endsWith('.pdf')) return 'i-lucide-file-text'
  if (/^(x\.com|reddit\.com)\//.test(h)) return 'i-lucide-message-circle'
  if (/^(pkg\.go\.dev|pub\.dev|open-vsx\.org|plugins\.jetbrains\.com)\//.test(h)) return 'i-lucide-package'
  if (/^docs\.|gitbook\.io|mintlify\.app|core\.telegram\.org|\/docs?\b|\/api\/v\d/.test(h)) return 'i-lucide-book-open'
  return 'i-lucide-globe'
}

function pick(id: string) {
  category.value = category.value === id ? 'all' : id
  // Jump back to the list when the toolbar is stuck far below its start.
  const top = results.value?.getBoundingClientRect().top ?? 0
  if (top < 0) results.value?.scrollIntoView({ block: 'start' })
}

function clear() {
  q.value = ''
  category.value = 'all'
  tag.value = ''
}

useSeoMeta({
  title: 'Links & resources',
  description: `${total} hand-picked TON links: docs, wallets, explorers, DeFi, APIs, SDKs, standards, analytics, security and community. Every link checked.`
})
</script>

<template>
  <div class="mx-auto max-w-(--ui-container) px-4 py-8 sm:px-6 sm:py-12">
    <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
      Links & resources
    </h1>
    <p class="mt-2 max-w-2xl text-muted">
      {{ total }} hand-picked places to learn TON, use it, build on it and look things up, in {{ linkCategories.length }} groups. Every link was checked by hand. A listing is not an endorsement. Know a better one?
      <a href="https://github.com/ugorur/tonutils/issues/new" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">Open an issue</a>.
    </p>

    <div class="sticky top-16 z-30 -mx-4 mt-6 border-b border-default bg-default/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div class="flex items-center gap-3">
        <UInput
          v-model="q"
          icon="i-lucide-search"
          placeholder="Search links"
          size="lg"
          class="min-w-0 flex-1 md:max-w-sm"
          aria-label="Search links"
        />
        <UButton
          v-if="tag"
          :label="tag"
          trailing-icon="i-lucide-x"
          color="primary"
          variant="subtle"
          :aria-label="`Remove tag filter ${tag}`"
          @click="tag = ''"
        />
        <p class="ml-auto hidden shrink-0 text-sm text-muted sm:block" aria-live="polite">
          {{ count }} {{ count === 1 ? 'link' : 'links' }}
        </p>
      </div>
      <nav class="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" aria-label="Link groups">
        <UButton
          label="All"
          size="sm"
          :color="category === 'all' ? 'primary' : 'neutral'"
          :variant="category === 'all' ? 'solid' : 'outline'"
          class="shrink-0"
          :aria-pressed="category === 'all'"
          @click="pick('all')"
        />
        <UButton
          v-for="c in linkCategories"
          :key="c.id"
          :label="c.title"
          :icon="c.icon"
          size="sm"
          :color="category === c.id ? 'primary' : 'neutral'"
          :variant="category === c.id ? 'solid' : 'outline'"
          class="shrink-0"
          :aria-pressed="category === c.id"
          @click="pick(c.id)"
        />
      </nav>
    </div>

    <p class="mt-4 text-sm text-muted sm:hidden" aria-live="polite">
      {{ count }} {{ count === 1 ? 'link' : 'links' }}
    </p>

    <div v-if="sections.length" ref="results" class="mt-6 scroll-mt-48 space-y-12">
      <section v-for="c in sections" :id="c.id" :key="c.id" class="scroll-mt-48" :aria-labelledby="`${c.id}-h`">
        <h2 :id="`${c.id}-h`" class="flex items-center gap-2 font-display text-xl font-semibold text-highlighted">
          <UIcon :name="c.icon" class="size-5 text-primary" />{{ c.title }}
          <span class="text-sm font-normal text-dimmed">{{ c.links.length }}</span>
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ c.description }}
        </p>
        <ul class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <li
            v-for="l in c.links"
            :key="l.url"
            class="group relative flex gap-3 rounded-lg border border-default p-4 transition-colors hover:border-primary/50"
          >
            <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-elevated text-primary" aria-hidden="true">
              <UIcon :name="kindIcon(l.url)" class="size-4.5" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="flex items-start justify-between gap-2">
                <a
                  :href="l.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-highlighted after:absolute after:inset-0 group-hover:text-primary"
                >{{ l.title }}<span class="sr-only"> (opens in a new tab)</span></a>
                <UIcon name="i-lucide-external-link" class="mt-0.5 size-4 shrink-0 text-dimmed group-hover:text-primary" aria-hidden="true" />
              </span>
              <span class="mt-1 block text-sm text-muted">{{ l.description }}</span>
              <span class="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                <button
                  v-for="t in l.tags"
                  :key="t"
                  type="button"
                  class="relative z-10 rounded-sm bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-toned hover:bg-accented hover:text-highlighted"
                  :aria-label="`Filter by tag ${t}`"
                  @click="tag = t"
                >
                  {{ t }}
                </button>
                <span class="ml-auto min-w-0 truncate font-mono text-xs text-dimmed">{{ host(l.url) }}</span>
              </span>
            </span>
          </li>
        </ul>
      </section>
    </div>
    <div v-else class="mt-6 rounded-lg border border-dashed border-default p-10 text-center">
      <p class="text-highlighted">
        No link matches these filters.
      </p>
      <p class="mt-1 text-sm text-muted">
        Clear the filters, or
        <a href="https://github.com/ugorur/tonutils/issues/new" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">suggest a link</a>.
      </p>
      <UButton class="mt-4" label="Clear filters" color="neutral" variant="outline" @click="clear" />
    </div>
  </div>
</template>
