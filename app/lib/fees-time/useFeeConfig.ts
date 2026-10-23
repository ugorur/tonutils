// Live fee config (params 18/20/21/24/25) for the site network, cached per network for the session.
import { onMounted, ref, shallowRef, watch } from 'vue'
import { useTonapi } from '~/composables/useTonapi'
import { useToncenter } from '~/composables/useToncenter'
import { type TonNetwork, useTonNetwork } from '~/composables/useTonNetwork'
import { type FeeConfig, fetchFeeConfig } from './fees'

const cache = new Map<TonNetwork, { config: FeeConfig, at: Date }>()

export function useFeeConfig() {
  const { network } = useTonNetwork()
  const tc = useToncenter(network)
  const api = useTonapi(network)
  const config = shallowRef<FeeConfig | null>(null)
  const fetchedAt = ref<Date | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let run = 0

  async function load(force = false) {
    const net = network.value
    const hit = cache.get(net)
    if (hit && !force) {
      config.value = hit.config
      fetchedAt.value = hit.at
      error.value = null
      return
    }
    const id = ++run
    loading.value = true
    error.value = null
    try {
      const c = await fetchFeeConfig(api.get, tc.v2)
      const at = new Date()
      cache.set(net, { config: c, at })
      if (id !== run) return
      config.value = c
      fetchedAt.value = at
    }
    catch (e) {
      if (id === run) error.value = e
    }
    finally {
      if (id === run) loading.value = false
    }
  }

  onMounted(() => load())
  watch(network, () => {
    config.value = null
    load()
  })

  return { network, config, fetchedAt, loading, error, refresh: () => load(true) }
}
