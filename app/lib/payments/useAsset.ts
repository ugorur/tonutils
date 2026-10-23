// Symbol / decimals / verification of a payment's asset. Known jettons resolve offline; others via tonapi /jettons.
import { computed, ref, shallowRef, watch } from 'vue'
import { useTonapi } from '~/composables/useTonapi'
import { useTonNetwork } from '~/composables/useTonNetwork'
import { COIN_DECIMALS, COIN_SYMBOL } from '~/utils/currency'
import { jettonDecimals } from '~/utils/ton/jetton'
import type { AssetInfo } from './link'
import { knownJetton } from './link'

const COIN_NAME_LABEL = `${COIN_SYMBOL} (native coin)`

export interface AssetView extends AssetInfo {
  name: string
  /** tonapi: whitelist | none | graylist | blacklist; 'known' for the built-in list. */
  verification: string
}

interface TonapiJetton { metadata: { name?: string, symbol?: string, decimals?: string | number }, verification?: string }

export function useAsset(master: () => string | undefined, fallbackDecimals: () => number | undefined = () => undefined) {
  const tonapi = useTonapi()
  const { network, isTestnet } = useTonNetwork()
  const fetched = shallowRef<TonapiJetton | null>(null)
  const error = ref<unknown>(null)
  const loading = ref(false)
  let session = 0

  const known = computed(() => {
    const m = master()
    return m && !isTestnet.value ? knownJetton(m) : undefined
  })

  async function load() {
    const my = ++session
    fetched.value = null
    error.value = null
    const m = master()
    if (!m || known.value) return
    loading.value = true
    try {
      const j = await tonapi.get<TonapiJetton>(`jettons/${encodeURIComponent(m)}`)
      if (my === session) fetched.value = j
    }
    catch (e) {
      if (my === session) error.value = e
    }
    finally {
      if (my === session) loading.value = false
    }
  }
  watch([master, network], load, { immediate: true })

  const asset = computed<AssetView | null>(() => {
    const m = master()
    if (!m) return { symbol: COIN_SYMBOL, name: COIN_NAME_LABEL, decimals: COIN_DECIMALS, known: true, verification: 'known' }
    const k = known.value
    if (k) return { symbol: k.symbol, name: k.name, decimals: k.decimals, master: m, known: true, verification: 'known' }
    const j = fetched.value
    if (j) return { symbol: j.metadata.symbol || 'tokens', name: j.metadata.name || 'Unnamed token', decimals: jettonDecimals(j.metadata), master: m, known: false, verification: j.verification ?? 'none' }
    const fd = fallbackDecimals()
    return fd === undefined ? null : { symbol: 'tokens', name: 'Unknown token', decimals: fd, master: m, known: false, verification: 'none' }
  })

  return { asset, error, loading, reload: load }
}
