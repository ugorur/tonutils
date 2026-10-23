import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'standards',
  title: 'Standards & reference contracts',
  description: 'TEPs, whitepapers and the canonical contract sources they describe.',
  icon: 'i-lucide-scroll-text',
  order: 12,
  links: [
    { title: 'TEPs (TON Enhancement Proposals)', url: 'https://github.com/ton-blockchain/TEPs', description: 'TON Enhancement Proposals: token, NFT, DNS and wallet standards.', tags: ['standards', 'tep'] },
    { title: 'TEP-74 Jetton standard', url: 'https://github.com/ton-blockchain/TEPs/blob/master/text/0074-jettons-standard.md', description: 'Fungible token (jetton) standard.', tags: ['tep', 'jetton'] },
    { title: 'TEP-89 Discoverable Jettons', url: 'https://github.com/ton-blockchain/TEPs/blob/master/text/0089-jetton-wallet-discovery.md', description: 'Find a jetton wallet address through the master contract.', tags: ['tep', 'jetton'] },
    { title: 'TEP-64 Token data standard', url: 'https://github.com/ton-blockchain/TEPs/blob/master/text/0064-token-data-standard.md', description: 'On-chain and off-chain metadata for jettons and NFTs.', tags: ['tep', 'metadata'] },
    { title: 'TEP-62 NFT standard', url: 'https://github.com/ton-blockchain/TEPs/blob/master/text/0062-nft-standard.md', description: 'Non-fungible token standard.', tags: ['tep', 'nft'] },
    { title: 'TEP-85 SBT standard', url: 'https://github.com/ton-blockchain/TEPs/blob/master/text/0085-sbt-standard.md', description: 'Soulbound token standard.', tags: ['tep', 'nft'] },
    { title: 'TEP-81 DNS standard', url: 'https://github.com/ton-blockchain/TEPs/blob/master/text/0081-dns-standard.md', description: 'TON DNS resolution standard.', tags: ['tep', 'dns'] },
    { title: 'TON Whitepapers overview', url: 'https://docs.ton.org/foundations/whitepapers/overview', description: 'Index of the original TON whitepapers.', tags: ['whitepaper'] },
    { title: 'TON Whitepaper (PDF)', url: 'https://docs.ton.org/ton.pdf', description: 'The original 2017 TON whitepaper by Nikolai Durov.', tags: ['whitepaper', 'pdf'] },
    { title: 'TON Blockchain paper', url: 'https://docs.ton.org/foundations/whitepapers/tblkch', description: 'Detailed specification of the TON blockchain.', tags: ['whitepaper'] },
    { title: 'TVM whitepaper', url: 'https://docs.ton.org/foundations/whitepapers/tvm', description: 'Specification of the TON Virtual Machine.', tags: ['whitepaper', 'tvm'] },
    { title: 'Catchain consensus paper', url: 'https://docs.ton.org/foundations/whitepapers/catchain', description: 'The Catchain BFT consensus protocol used by validators.', tags: ['whitepaper', 'consensus'] },
    { title: 'Simplex consensus paper', url: 'https://docs.ton.org/foundations/whitepapers/simplex', description: 'The Simplex consensus protocol adopted by TON.', tags: ['whitepaper', 'consensus'] },
    { title: 'Simplex consensus docs', url: 'https://ton-blockchain.github.io/simplex-docs/', description: 'Technical documentation for Simplex consensus.', tags: ['consensus'] },
    { title: 'Wallet V5 (W5) docs', url: 'https://docs.ton.org/contracts/standard/wallets/v5', description: 'Docs for the v5r1 (W5) wallet contract.', tags: ['wallet', 'w5'] },
    { title: 'W5 contract source', url: 'https://github.com/ton-blockchain/wallet-contract-v5', description: 'Source code of the W5 wallet contract.', tags: ['wallet', 'github'] },
    { title: 'Highload wallet v3', url: 'https://github.com/ton-blockchain/highload-wallet-contract-v3', description: 'Wallet contract for bulk transfers.', tags: ['wallet', 'github'] },
    { title: 'Multisig v2', url: 'https://github.com/ton-blockchain/multisig-contract-v2', description: 'Official multisig wallet contract.', tags: ['wallet', 'multisig'] },
    { title: 'Jetton contract', url: 'https://github.com/ton-blockchain/jetton-contract', description: 'Reference jetton implementation.', tags: ['jetton', 'example'] },
    { title: 'Stablecoin contract', url: 'https://github.com/ton-blockchain/stablecoin-contract', description: 'Jetton with governance, used for stablecoins.', tags: ['jetton', 'example'] },
    { title: 'Getgems NFT contracts', url: 'https://github.com/getgems-io/nft-contracts', description: 'Reference NFT contracts by Getgems.', tags: ['nft', 'example'] },
    { title: 'Payment channels', url: 'https://github.com/ton-blockchain/payment-channels', description: 'Reference payment channel contracts.', tags: ['example'] }
  ]
})
