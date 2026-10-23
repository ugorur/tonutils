import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_IDS } from './app/utils/categories'

const SITE_URL = 'https://tonutils.io'

// Every tool folder is one route. Folder name === slug (enforced by registry.test.ts).
const toolSlugs = readdirSync(join(import.meta.dirname, 'app/tools'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

const staticRoutes = ['/', '/tools', '/links', '/projects', '/about']
const allRoutes = [
  ...staticRoutes,
  ...toolSlugs.map(s => `/tools/${s}`),
  ...CATEGORY_IDS.map(c => `/categories/${c}`)
]

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [{ name: 'theme-color', content: '#0098EA' }]
    }
  },

  colorMode: { preference: 'system', fallback: 'dark' },

  icon: {
    // Bundle the lucide icons we use so the worker never fetches icons at runtime.
    clientBundle: {
      scan: { globInclude: ['app/**/*.vue', 'app/**/*.ts'], globExclude: ['node_modules', '.nuxt', '.output'] }
    },
    serverBundle: 'local'
  },

  runtimeConfig: {
    public: { siteUrl: SITE_URL }
  },

  nitro: {
    preset: 'cloudflare_module',
    prerender: {
      crawlLinks: true,
      // Emit tools.html instead of tools/index.html so Workers assets serve /tools without a 307 to /tools/.
      autoSubfolderIndex: false,
      routes: allRoutes,
      failOnError: true
    }
  },

  typescript: {
    // @ton/* APIs use Buffer everywhere (polyfilled in app/plugins/buffer.client.ts).
    appTsConfig: { compilerOptions: { types: ['node'] } },
    nodeTsConfig: { compilerOptions: { types: ['node'] } }
  },

  vite: {
    optimizeDeps: {
      // CommonJS packages must be pre-bundled for the dev server (workers included).
      include: [
        'buffer', '@ton/core', '@ton/crypto', '@ton/ton',
        'qrcode', 'jsqr', '@ton/tasm', '@ton-community/tlb-parser', '@ton-community/tlb-runtime',
        '@ton/tolk-js', '@ton-community/func-js', '@ton-community/tlb-codegen',
        '@ton/sandbox/dist/executor/Executor', '@ton/sandbox/dist/config/defaultConfig'
      ]
    },
    // ES workers allow code splitting and match the dev server. See app/utils/lazy/.
    worker: { format: 'es' }
  },

  hooks: {
    // Every tool page would otherwise <link rel=prefetch> all ~320 lazy chunks (every Tool.vue, the 7–9 MB
    // compiler/sandbox workers): ~29 MB downloaded in the background on each visit. Load chunks on demand only.
    'build:manifest': (manifest) => {
      for (const chunk of Object.values(manifest)) chunk.prefetch = false
    },
    // Dev-only smoke page for the lazy WASM loaders. TONUTILS_DEV_PAGES=1 also adds it to a production build.
    'pages:extend': (pages) => {
      if (process.env.NODE_ENV !== 'production' || process.env.TONUTILS_DEV_PAGES) {
        pages.push({ name: 'dev-loaders', path: '/__dev/loaders', file: join(import.meta.dirname, 'app/dev/LoaderCheck.vue') })
      }
    },
    // Static sitemap: every route is known at build time.
    'nitro:build:public-assets': (nitro) => {
      const today = new Date().toISOString().slice(0, 10)
      const urls = allRoutes
        .map(r => `  <url><loc>${SITE_URL}${r === '/' ? '' : r}</loc><lastmod>${today}</lastmod></url>`)
        .join('\n')
      writeFileSync(
        join(nitro.options.output.publicDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
      )
    }
  }
})
