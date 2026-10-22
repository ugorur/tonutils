# TonUtils

## Facts
- **Name:** TonUtils
- **Domain:** tonutils.io (Cloudflare account `Leirapcom@gmail.com's Account`, id `2af090fc01e069acc0cf62dc60cce5d2`; zone id `1488cd4455682db22ea082e40374d7e3`)
- **Purpose:** A free toolbox for the TON blockchain. Regular users and developers find every tool they need, plus guides, curated links and featured ecosystem projects.
- **Type:** Website
- **Repo:** https://github.com/ugorur/tonutils (**public**)
- **Stack:** Nuxt 4, TypeScript, pnpm, deployed as a Cloudflare Worker (Nitro `cloudflare_module` preset). TON libraries: `@ton/core`, `@ton/crypto`, `@ton/ton`. TonConnect is used for actions that need a wallet signature.
- **Database:** none. Tools catalog, links and projects live as content files in the repo.
- **Login:** none (public)
- **Languages:** English only.

## Rules
- **The repo is public.** Never commit secrets, private keys, mnemonics, internal hostnames or customer data. Every file should be something we are fine with the world reading.
- **Tools run client-side.** Mnemonics, private keys and other sensitive input are processed in the browser and never sent to our server or logged. Each tool page says this.
- Read on-chain data from public APIs (toncenter, tonapi). Never put API keys in client code. If a key is needed, proxy the call through a server route and read the key from a Worker secret.
- Tools that send transactions go through TonConnect. The site never holds user keys.
- Links and projects must be real and verified. No placeholder URLs.

## Secrets
- CI deploy uses GitHub Actions repo secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts Write on the account + Workers Routes Write on the tonutils.io zone; no DNS permission, so bind the Worker with a zone route, not a custom domain) and `CLOUDFLARE_ACCOUNT_ID`. The token is also kept in `pass` as `cloudflare.com/tokens/tonutils-deploy`.
- If we ever need a TON deployer wallet, its mnemonic goes in `pass` (`ton/tonutils-deployer-key`) and its address is public. Use testnet first. A mainnet deploy costs gas, and the owner funds it.

## Images
- Generate images with the `codex` CLI.

## Commands
- Package manager is pnpm (version pinned in `package.json` `packageManager`; run `corepack pnpm …` if `pnpm` is not on PATH).
- `pnpm dev` dev server · `pnpm test` vitest (node env, `app/**/*.test.ts`) · `pnpm typecheck` nuxi typecheck · `pnpm build` Cloudflare Worker build into `.output/` · `pnpm preview` serve the built Worker locally with `wrangler dev` (run `pnpm build` first) · `pnpm deploy` build + `wrangler deploy`.
- Before calling work done: `pnpm test`, `pnpm typecheck`, `pnpm build` all green.

## Adding a tool
Each tool is one self-contained folder. You never edit a central list: the registry finds tools with `import.meta.glob`, and `nuxt.config.ts` prerenders `/tools/<folder>` and adds it to the sitemap.

```
app/tools/<slug>/
  meta.ts        export default defineTool({...})   (import { defineTool } from '~/utils/tool')
  Tool.vue       the UI; rendered client-only inside <ToolShell> by app/pages/tools/[slug].vue
  logic.ts       pure TypeScript, no Vue; all real work happens here
  logic.test.ts  vitest tests for logic.ts with known-good vectors (from docs, another implementation, or on-chain)
```

- **meta.ts fields** (`ToolMeta` in `app/utils/tool.ts`): `slug` (must equal the folder name, kebab-case), `name` (sentence case), `short` (≤100 chars, cards/search), `description` (1–2 sentences, page + SEO), `category` (one id from `app/utils/categories.ts`; do not add categories casually), `audience: 'user' | 'dev' | 'both'`, `network: 'offline' | 'read' | 'wallet'`, `keywords: string[]`, optional `related: string[]` (existing slugs), `icon` (literal `'i-lucide-*'` string so the icon bundler finds it; check the name exists in `@iconify-json/lucide`), optional `featured`.
- `app/utils/registry.test.ts` checks every meta.ts (slug = folder, valid category, icon prefix, related slugs exist). Keep it green.
- **Tool.vue** has no props. It may import `@ton/*` freely: it only ever runs in the browser. Pages and shared layout must not import `@ton/*` (SSR/prerender must stay crypto-free). Read the network with `useTonNetwork()` and default tabs to it.
- **Never** send mnemonics/keys anywhere, never log them, never persist them. `network: 'read'` tools call public APIs from the browser through the composables below; if an API key is ever needed, proxy through a `server/` route that reads a Worker secret.
- Tests: `pnpm test`. A tool is not done until its `logic.test.ts` passes with real vectors, and you have exercised the UI in a browser (mobile 375px and desktop).

### Shared building blocks (reuse, do not duplicate)
Auto-imported (no import needed in .vue files):
- `<ToolShell :tool>`: header, privacy badge, card. Used by the page; tools don't render it.
- `<CopyButton :value="string" label? size?>`: clipboard with feedback.
- `<AddressInput v-model="string" label? placeholder? required? @parsed="(a: Address | null)">`: TON address field with validation. Client-only (imports `@ton/core`).
- `<AmountInput v-model="string" v-model:nano="bigint | null" label? unit="TON" :decimals="9">`: exact decimal amount input.
- `<ResultField label value mono=true copy=true hint?>` (default slot overrides the value) and `<KeyValue :items="KeyValueItem[]">` (`{ label, value, mono?, copy?, hint? }`, type from `~/components/KeyValue.vue`).
- `<JsonView :value label?>`: pretty, bigint-safe JSON with copy.
- `<NetworkSwitch>`: mainnet/testnet pill (already in the header).
- `useTonNetwork()` → `{ network: Ref<'mainnet'|'testnet'>, isTestnet, toggle }` (cookie-persisted; read it only client-side).
- `useToncenter(network?)` → `{ v2<T>(method, query?) /* returns result */, v3<T>(path, query?), baseUrl() }`.
- `useTonapi(network?)` → `{ get<T>(path, query?), baseUrl() }`.
  Both: keyless, one queue per host (~1 req/s), retry with backoff on 429/5xx/network errors, throw `TonApiError { provider, status, url, body, isRateLimit }`. Show `error.message` to the user.
- Utils: `parseUnits(str, decimals=9): bigint`, `formatUnits(bigint, decimals=9): string`, `groupThousands(str)` (`app/utils/units.ts`); `toolRegistry`, `getTool`, `toolsInCategory`, `searchTools` (`app/utils/registry.ts`); `CATEGORIES`, `CATEGORY_IDS`, `isCategoryId` (`app/utils/categories.ts`); `rateLimitedJson`, `buildUrl`, `TonApiError` (`app/utils/api-client.ts`).
- Nuxt UI v4 components (`UInput`, `UFormField`, `UButton`, `UTabs`, `UAlert`, `UBadge`, …) for everything else. Theme: `primary` = TON blue (`ton-*`), `neutral` = `abyss-*`; fonts `font-display` (Unbounded, headings), `font-sans` (Onest), `font-mono` (JetBrains Mono, addresses/hashes).

### Links and projects
- `app/data/links/<id>.ts` → `export default defineLinkCategory({...})`; `app/data/projects/<id>.ts` → `export default defineProjectCategory({...})` (types in `app/data/types.ts`). Auto-discovered, sorted by `order`. Verify every URL resolves before adding it.
