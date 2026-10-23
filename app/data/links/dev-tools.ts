import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'dev-tools',
  title: 'Developer tools',
  description: 'Frameworks, editors, debuggers and testnet coins for building contracts.',
  icon: 'i-lucide-wrench',
  order: 2,
  links: [
    { title: 'Blueprint', url: 'https://github.com/ton-org/blueprint', description: 'Development environment for writing, testing and deploying contracts.', tags: ['blueprint'] },
    { title: 'Blueprint docs', url: 'https://docs.ton.org/contracts/blueprint/overview', description: 'Official Blueprint documentation.', tags: ['blueprint', 'docs'] },
    { title: 'Acton', url: 'https://ton-blockchain.github.io/acton/docs/welcome', description: 'Rust CLI to build, test, deploy and verify Tolk contracts.', tags: ['tolk', 'cli'] },
    { title: 'Acton GitHub', url: 'https://github.com/ton-blockchain/acton', description: 'Source repository of the Acton toolkit.', tags: ['github', 'cli'] },
    { title: 'Sandbox', url: 'https://github.com/ton-blockchain/sandbox', description: 'Local blockchain emulator for testing contracts in JS/TS.', tags: ['testing'] },
    { title: 'toncli', url: 'https://github.com/disintar/toncli', description: 'Older CLI for FunC development and testing.', tags: ['cli', 'legacy'] },
    { title: 'VS Code extension (Open VSX)', url: 'https://open-vsx.org/extension/ton-core/vscode-ton', description: 'Tolk, FunC, Fift and TL-B support for VS Code-compatible editors.', tags: ['vscode'] },
    { title: 'VS Code setup guide', url: 'https://docs.ton.org/contracts/ide/vscode', description: 'Official guide to setting up VS Code for TON.', tags: ['vscode', 'docs'] },
    { title: 'JetBrains TON plugin', url: 'https://plugins.jetbrains.com/plugin/23382-ton', description: 'Tolk, FunC, Fift and TL-B support for IntelliJ-based IDEs.', tags: ['jetbrains'] },
    { title: 'JetBrains TON plugin source', url: 'https://github.com/ton-blockchain/intellij-ton', description: 'Source code of the JetBrains TON plugin.', tags: ['jetbrains', 'github'] },
    { title: 'TON Language Server', url: 'https://github.com/ton-blockchain/ton-language-server', description: 'Language server behind the TON editor integrations.', tags: ['lsp'] },
    { title: 'Nujan IDE', url: 'https://ide.nujan.io', description: 'Browser IDE for writing and deploying TON contracts.', tags: ['web-ide'] },
    { title: 'TxTracer', url: 'https://txtracer.ton.org', description: 'Replay a transaction step by step in the TVM (formerly Retracer).', tags: ['debug', 'tvm'] },
    { title: 'Testnet giver bot', url: 'https://t.me/testgiver_ton_bot', description: 'Telegram bot that sends free testnet coins.', tags: ['faucet'] },
    { title: 'TONX testnet faucet', url: 'https://faucet.tonxapi.com', description: 'Web faucet for testnet coins and tgBTC.', tags: ['faucet'] },
    { title: 'Get testnet coins guide', url: 'https://docs.ton.org/onboarding/wallet-apps/get-coins', description: 'Official guide to getting testnet coins.', tags: ['faucet', 'docs'] }
  ]
})
