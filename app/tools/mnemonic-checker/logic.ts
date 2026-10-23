import type { TonPhraseKind } from '~/lib/wallet-derivation/phrase'
import { BIP39_LENGTHS, bip39Validate, isWord, parsePhrase, suggestWords, tonPhraseKind } from '~/lib/wallet-derivation/phrase'

export interface WordCheck {
  word: string
  known: boolean
  suggestions: string[]
}

export type Verdict = 'empty' | 'unknown-words' | 'ton' | 'ton-password' | 'bip39' | 'both' | 'neither'

export interface PhraseCheck {
  words: WordCheck[]
  count: number
  ton: TonPhraseKind
  bip39: boolean
  /** 12/15/18/21/24 words. */
  bip39Length: boolean
  verdict: Verdict
}

/** Classifies a phrase as a TON mnemonic, a BIP39 mnemonic, both or neither. Offline. */
export async function checkPhrase(text: string): Promise<PhraseCheck> {
  const list = parsePhrase(text)
  const words = list.map(word => ({ word, known: isWord(word), suggestions: isWord(word) ? [] : suggestWords(word) }))
  const bip39Length = (BIP39_LENGTHS as readonly number[]).includes(list.length)
  const base = { words, count: list.length, bip39Length }
  if (!list.length) return { ...base, ton: 'none', bip39: false, verdict: 'empty' }
  if (words.some(w => !w.known)) return { ...base, ton: 'none', bip39: false, verdict: 'unknown-words' }
  const [ton, bip39] = await Promise.all([tonPhraseKind(list), bip39Validate(list)])
  const verdict: Verdict = ton !== 'none' && bip39 ? 'both' : ton !== 'none' ? ton : bip39 ? 'bip39' : 'neither'
  return { ...base, ton, bip39, verdict }
}
