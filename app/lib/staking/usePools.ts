import type { StakingPool } from './pools'
import { fetchPools } from './pools'

// One tonapi /staking/pools request per network per page session (the list is ~1000 pools, ~200 KB).
const cache = new Map<string, Promise<StakingPool[]>>()

/** Live tonapi pool list for the site network, reloaded when the network changes. Client-only. */
export function usePools() {
  const { network } = useTonNetwork()
  const api = useTonapi()
  const pools = shallowRef<StakingPool[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)

  async function load(force = false) {
    const net = network.value
    if (force) cache.delete(net)
    if (!cache.has(net)) cache.set(net, fetchPools(api).catch((e) => {
      cache.delete(net)
      throw e
    }))
    loading.value = true
    error.value = null
    try {
      const list = await cache.get(net)!
      if (net === network.value) pools.value = list
    }
    catch (e) {
      if (net === network.value) error.value = e
    }
    finally {
      loading.value = false
    }
  }

  watch(network, () => load(), { immediate: true })
  return { pools, loading, error, load, network }
}

/** Current unix time in seconds, refreshed every 30 s (for "next payout in …"). */
export function useNowSec() {
  const now = ref(Math.floor(Date.now() / 1000))
  const timer = setInterval(() => (now.value = Math.floor(Date.now() / 1000)), 30_000)
  onScopeDispose(() => clearInterval(timer))
  return now
}
