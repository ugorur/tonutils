import type { KeyPairHex } from '~/lib/wallet-derivation/phrase'
import { bip39Validate, isWord, parsePhrase, tonKeys, tonPhraseKind } from '~/lib/wallet-derivation/phrase'

export { parsePhrase }

export type PhraseProblem =
  | { kind: 'empty' }
  | { kind: 'unknown-words', words: string[] }
  | { kind: 'bip39' }
  | { kind: 'needs-password' }
  | { kind: 'wrong-password' }
  | { kind: 'no-password' }
  | { kind: 'invalid' }

export type PhraseResult = { ok: true, keys: KeyPairHex, words: number } | { ok: false, problem: PhraseProblem }

/** Keys of a TON mnemonic, or the most useful reason it does not work. Never leaves the browser. */
export async function keysFromPhrase(text: string, password = ''): Promise<PhraseResult> {
  const words = parsePhrase(text)
  if (!words.length) return { ok: false, problem: { kind: 'empty' } }
  const unknown = words.filter(w => !isWord(w))
  if (unknown.length) return { ok: false, problem: { kind: 'unknown-words', words: [...new Set(unknown)] } }
  try {
    return { ok: true, keys: await tonKeys(words, password), words: words.length }
  }
  catch {
    const kind = await tonPhraseKind(words)
    if (kind === 'ton-password') return { ok: false, problem: { kind: password ? 'wrong-password' : 'needs-password' } }
    if (kind === 'ton' && password) return { ok: false, problem: { kind: 'no-password' } }
    if (await bip39Validate(words)) return { ok: false, problem: { kind: 'bip39' } }
    return { ok: false, problem: { kind: 'invalid' } }
  }
}
