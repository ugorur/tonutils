export type TonNetwork = 'mainnet' | 'testnet'

/**
 * Global mainnet/testnet choice, persisted in a cookie.
 * Pages are prerendered with the default (mainnet), so render network-dependent UI
 * only inside <ClientOnly> (tools already are).
 */
export function useTonNetwork() {
  const network = useCookie<TonNetwork>('ton-network', {
    default: () => 'mainnet',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax'
  })
  const isTestnet = computed(() => network.value === 'testnet')
  const toggle = () => {
    network.value = isTestnet.value ? 'mainnet' : 'testnet'
  }
  return { network, isTestnet, toggle }
}
