import { ref, watch } from 'vue'
import { FIAT_CURRENCIES, type FiatCurrency } from './core'

const KEY = 'tonutils:fiat'

/** Fiat currency choice shared by the accounts tools, remembered in this browser. */
export function useFiatCurrency() {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(KEY)
  }
  catch { /* blocked storage */ }
  const currency = ref<FiatCurrency>((FIAT_CURRENCIES as readonly string[]).includes(saved ?? '') ? saved as FiatCurrency : 'USD')
  watch(currency, (v) => {
    try {
      localStorage.setItem(KEY, v)
    }
    catch { /* ignore */ }
  })
  return { currency, items: FIAT_CURRENCIES.map(c => ({ label: c, value: c })) }
}
