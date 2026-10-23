import { COIN_NAME } from '../../utils/currency'
import { defineProjectCategory } from '../types'

export default defineProjectCategory({
  id: 'defi',
  title: 'DeFi',
  description: 'Swaps, lending, derivatives, stablecoins and launchpads.',
  icon: 'i-lucide-chart-candlestick',
  order: 2,
  projects: [
    { name: 'STON.fi', url: 'https://ston.fi', description: 'AMM DEX with swaps, pools, farms and the Omniston liquidity aggregation protocol.', tags: ['dex', 'sdk', 'open-source', 'audited'], featured: true },
    { name: 'DeDust', url: 'https://dedust.io', description: 'TON-native DEX with volatile and stable pools and multi-hop swaps.', tags: ['dex', 'sdk', 'audited'] },
    { name: 'TONCO', url: 'https://tonco.io', description: 'Concentrated-liquidity DEX; range positions are NFTs.', tags: ['dex', 'audited'] },
    { name: 'Megaton Finance', url: 'https://megaton.fi', description: 'Long-running DEX with liquidity pools, farming and staking.', tags: ['dex', 'yield'] },
    { name: 'Bidask', url: 'https://bidask.finance/en/', description: 'DEX built on bin-based discrete liquidity.', tags: ['dex'] },
    { name: 'swap.coffee', url: 'https://swap.coffee', description: 'DEX aggregator that routes swaps across TON DEXs, with a public API and widget.', tags: ['aggregator', 'api', 'mini-app'] },
    { name: 'GroypFi', url: 'https://groypfi.io', description: 'All-in-one DeFi front end with aggregated swaps.', tags: ['aggregator', 'mini-app'] },
    { name: 'EVAA Protocol', url: 'https://evaa.finance', description: `Lending market: supply and borrow ${COIN_NAME}, USD₮ and liquid staking tokens.`, tags: ['lending', 'mini-app', 'audited'], featured: true },
    { name: 'Affluent', url: 'https://affluent.org', description: 'Lending and asset management with curated vaults.', tags: ['lending', 'yield'] },
    { name: 'OctaLend', url: 'https://octalend.xyz', description: 'Formerly DAOLama. Borrow against NFTs and Telegram Gifts.', tags: ['lending', 'nft', 'telegram-gifts'] },
    { name: 'Delea Finance', url: 'https://app.delea.finance', description: 'Collateralized debt position (CDP) protocol.', tags: ['lending'] },
    { name: 'Storm Trade', url: 'https://storm.tg', description: 'Perpetual futures on crypto, stocks, commodities and FX, inside Telegram.', tags: ['perps', 'mini-app'], featured: true },
    { name: 'Tradoor', url: 'https://tradoor.io', description: 'Perpetual futures DEX using Pyth price feeds.', tags: ['perps'] },
    { name: 'Electra', url: 'https://electra.exchange', description: 'High-leverage on-chain perpetuals exchange.', tags: ['perps'] },
    { name: 'TON Hedge', url: 'https://tonhedge.com', description: 'On-chain options trading.', tags: ['options'] },
    { name: 'Coffin.Meme', url: 'https://coffin.meme', description: 'Short TON memecoins on-chain.', tags: ['perps', 'memecoins'] },
    { name: 'Tether USD₮', url: 'https://tether.to/en/', description: 'Issuer of native USD₮ on TON, the main stablecoin in the ecosystem.', tags: ['stablecoin'] },
    { name: 'Ethena', url: 'https://ethena.fi', description: 'Synthetic dollar USDe and yield-bearing tsUSDe, available on TON.', tags: ['stablecoin', 'yield'] },
    { name: 'Torch Finance', url: 'https://torch.finance', description: 'Stableswap DEX and issuer of the tgUSD stablecoin.', tags: ['stablecoin', 'dex'] },
    { name: 'Tonnel Network', url: 'https://www.tonnel.network', description: 'Zero-knowledge privacy protocol for private transfers; also runs a Telegram Gifts market.', tags: ['privacy', 'telegram-gifts'] },
    { name: 'JVault', url: 'https://jvault.xyz', description: 'Jetton staking pools, token launchpad and liquidity locker.', tags: ['launchpad', 'yield'] },
    { name: 'Tonstarter', url: 'https://www.tonstarter.com', description: 'Launchpad for token sales, IDOs and airdrops.', tags: ['launchpad'] },
    { name: 'TonUP', url: 'https://tonup.io', description: 'Launchpad that curates early-stage TON projects.', tags: ['launchpad'] }
  ]
})
