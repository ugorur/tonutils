// Imported first by every worker: @ton/* and the emscripten loaders expect Node's Buffer.
import { Buffer } from 'buffer'

if (!('Buffer' in globalThis)) Object.assign(globalThis, { Buffer })
