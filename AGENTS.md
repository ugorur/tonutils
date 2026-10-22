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
