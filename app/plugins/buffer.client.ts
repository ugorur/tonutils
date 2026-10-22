import { Buffer } from 'buffer'

// @ton/* expect Node's Buffer. Tools are lazy-loaded after plugins run, so this is in place first.
export default defineNuxtPlugin(() => {
  if (!('Buffer' in globalThis)) Object.assign(globalThis, { Buffer })
})
