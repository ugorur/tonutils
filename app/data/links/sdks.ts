import { defineLinkCategory } from '../types'

export default defineLinkCategory({
  id: 'sdks',
  title: 'SDKs for other languages',
  description: 'Go, Python, Rust, Kotlin, Java, .NET, PHP, Dart and Elixir libraries.',
  icon: 'i-lucide-layers',
  order: 11,
  links: [
    { title: 'SDK list (official)', url: 'https://docs.ton.org/applications/sdks', description: 'Official table of TON SDKs by language.', tags: ['docs'] },
    { title: 'tonutils-go', url: 'https://github.com/xssnick/tonutils-go', description: 'Full Go library: ADNL, liteclient, wallets, DNS and Storage.', tags: ['go'] },
    { title: 'tonutils-go package docs', url: 'https://pkg.go.dev/github.com/xssnick/tonutils-go', description: 'Go package reference for tonutils-go.', tags: ['go', 'docs'] },
    { title: 'tongo', url: 'https://github.com/tonkeeper/tongo', description: 'Go SDK by the Keeper (formerly Tonkeeper) team.', tags: ['go'] },
    { title: 'tonlib-go', url: 'https://github.com/ton-blockchain/tonlib-go', description: 'Go bindings for tonlib.', tags: ['go'] },
    { title: 'pytoniq', url: 'https://github.com/yungwine/pytoniq', description: 'Python SDK with a native ADNL liteclient.', tags: ['python'] },
    { title: 'pytoniq-core', url: 'https://github.com/yungwine/pytoniq-core', description: 'Python cells, BOC and address primitives.', tags: ['python'] },
    { title: 'pytoniq docs', url: 'https://yungwine.gitbook.io/pytoniq-doc/', description: 'Documentation for pytoniq.', tags: ['python', 'docs'] },
    { title: 'tonutils (Python)', url: 'https://github.com/nessshon/tonutils', description: 'High-level Python SDK.', tags: ['python'] },
    { title: 'tonutils (Python) docs', url: 'https://tonutils.mintlify.app/', description: 'Documentation for the Python tonutils library.', tags: ['python', 'docs'] },
    { title: 'pytonlib', url: 'https://github.com/toncenter/pytonlib', description: 'Python wrapper around tonlibjson by TON Center.', tags: ['python'] },
    { title: 'tonsdk (Python)', url: 'https://github.com/tonfactory/tonsdk', description: 'Older Python SDK.', tags: ['python', 'legacy'] },
    { title: 'tonpy', url: 'https://github.com/disintar/tonpy', description: 'Python bindings to the C++ TON primitives.', tags: ['python'] },
    { title: 'tonpy docs', url: 'https://tonpy.dton.io/', description: 'Documentation for tonpy.', tags: ['python', 'docs'] },
    { title: 'TonTools', url: 'https://github.com/yungwine/TonTools', description: 'High-level Python library.', tags: ['python'] },
    { title: 'ton-rs', url: 'https://github.com/ston-fi/ton-rs', description: 'Rust SDK maintained by STON.fi.', tags: ['rust'] },
    { title: 'tonlib-rs', url: 'https://github.com/ston-fi/tonlib-rs', description: 'Rust bindings to tonlib by STON.fi.', tags: ['rust'] },
    { title: 'ton-kotlin', url: 'https://github.com/ton-blockchain/ton-kotlin', description: 'Kotlin Multiplatform SDK.', tags: ['kotlin'] },
    { title: 'ton4j', url: 'https://github.com/ton-blockchain/ton4j', description: 'Java SDK: wallets, contracts, tonlib and liteclient.', tags: ['java'] },
    { title: 'tonlib-java', url: 'https://github.com/ton-blockchain/tonlib-java', description: 'Java bindings for tonlib.', tags: ['java'] },
    { title: 'TonSdk.NET', url: 'https://github.com/continuation-team/TonSdk.NET', description: 'C# / .NET SDK.', tags: ['csharp', 'dotnet'] },
    { title: 'TonLib.NET', url: 'https://github.com/justdmitry/TonLib.NET', description: '.NET wrapper for tonlib.', tags: ['csharp', 'dotnet'] },
    { title: 'olifanton/ton', url: 'https://github.com/olifanton/ton', description: 'PHP library for TON.', tags: ['php'] },
    { title: 'ton_dart', url: 'https://pub.dev/packages/ton_dart', description: 'Dart and Flutter package for TON.', tags: ['dart'] },
    { title: 'ton (Elixir)', url: 'https://github.com/ayrat555/ton', description: 'Elixir library for wallets and messages.', tags: ['elixir'] },
    { title: 'ton-grpc', url: 'https://github.com/getgems-io/ton-grpc', description: 'gRPC interface to liteservers by Getgems.', tags: ['grpc'] },
    { title: 'adnl', url: 'https://github.com/tjifyodor/adnl', description: 'Standalone client for TON\'s ADNL protocol.', tags: ['adnl'] }
  ]
})
