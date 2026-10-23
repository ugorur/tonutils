import { defineLinkCategory } from '../types'
import { COIN_NAME } from '../../utils/currency'

export default defineLinkCategory({
  id: 'defi',
  title: 'DeFi & bridges',
  description: 'DEXes, lending, liquid staking, perps and cross-chain bridges.',
  icon: 'i-lucide-arrow-left-right',
  order: 5,
  links: [
    { title: 'STON.fi', url: 'https://ston.fi', description: 'AMM DEX with swaps and liquidity pools.', tags: ['dex'] },
    { title: 'STON.fi docs', url: 'https://docs.ston.fi', description: 'Developer docs and SDKs for STON.fi.', tags: ['dex', 'docs'] },
    { title: 'DeDust', url: 'https://dedust.io', description: 'AMM DEX with swaps and liquidity pools.', tags: ['dex'] },
    { title: 'DeDust docs', url: 'https://docs.dedust.io', description: 'Developer docs for DeDust.', tags: ['dex', 'docs'] },
    { title: 'TONCO', url: 'https://tonco.io', description: 'Concentrated-liquidity DEX.', tags: ['dex'] },
    { title: 'swap.coffee', url: 'https://swap.coffee', description: 'DEX aggregator that routes swaps across TON pools.', tags: ['dex', 'aggregator'] },
    { title: 'Megaton Finance', url: 'https://megaton.fi', description: 'AMM DEX on TON.', tags: ['dex'] },
    { title: 'EVAA', url: 'https://evaa.finance', description: 'Lending and borrowing protocol.', tags: ['lending'] },
    { title: 'Affluent', url: 'https://affluent.org', description: 'Lending and on-chain asset management.', tags: ['lending'] },
    { title: 'OctaLend (formerly DAOLama)', url: 'https://daolama.co', description: 'Loans backed by NFTs as collateral.', tags: ['lending', 'nft'] },
    { title: 'Tonstakers', url: 'https://tonstakers.com', description: `Liquid staking for ${COIN_NAME} (tsTON).`, tags: ['staking'] },
    { title: 'bemo', url: 'https://bemo.fi', description: `Liquid staking for ${COIN_NAME}.`, tags: ['staking'] },
    { title: 'Hipo Finance', url: 'https://hipo.finance', description: `Liquid staking for ${COIN_NAME}.`, tags: ['staking'] },
    { title: 'JVault', url: 'https://jvault.xyz', description: 'Jetton staking pools, launchpad and token locker.', tags: ['staking'] },
    { title: 'Torch Finance', url: 'https://torch.finance', description: 'Stableswap and yield protocol.', tags: ['defi'] },
    { title: 'Storm Trade', url: 'https://storm.tg', description: 'Perpetual futures exchange.', tags: ['perps'] },
    { title: 'Tradoor', url: 'https://www.tradoor.io', description: 'Perpetual futures exchange.', tags: ['perps'] },
    { title: 'USDT0', url: 'https://usdt0.to', description: 'Omnichain USD₮ over LayerZero, available on TON.', tags: ['bridge', 'stablecoin'] },
    { title: 'LayerZero', url: 'https://layerzero.network', description: 'Omnichain messaging protocol used by USDT0 and other assets on TON.', tags: ['bridge'] },
    { title: 'Symbiosis', url: 'https://symbiosis.finance', description: 'Cross-chain swaps and bridging with TON support.', tags: ['bridge'] },
    { title: 'rhino.fi', url: 'https://rhino.fi', description: 'Stablecoin bridging and payments with TON support.', tags: ['bridge'] }
  ]
})
