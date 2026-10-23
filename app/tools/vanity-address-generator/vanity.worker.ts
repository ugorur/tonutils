// Vanity search worker: WebCrypto only, no Buffer or @ton/* needed.
import { exposeWorker } from '~/utils/lazy/rpc'
import { searchSlice, supportsEd25519 } from './logic'

export const handlers = { searchSlice, supportsEd25519 }
exposeWorker(handlers)
