// Telegram collectibles (Fragment) on TON mainnet. Shared by the telegram-* tools. Pure TS (imports @ton/core: client/logic only).
import { Address } from '@ton/core'

// Addresses and code hashes read from toncenter /api/v3/nft/items and tonapi /v2/accounts/{id}/nfts on 2026-10-22.

/** "Telegram Usernames" collection, EQCA14o1-VWhS2efqoh_9M1b_A9DtKTuoqfmkn83AbJzwnPi. */
export const USERNAMES_COLLECTION = '0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2'
/** "Anonymous Telegram Numbers" (+888) collection, EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N. */
export const NUMBERS_COLLECTION = '0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2'

/**
 * Code hashes of Telegram gift NFT items (every gift collection, e.g. Plush Pepes, Artisan Bricks, uses one of these).
 * The code is public, so a hash match alone is not proof: callers also require tonapi trust "whitelist".
 */
export const GIFT_ITEM_CODE_HASHES = new Set([
  'MNzX1bb89ZaMJ5Hh4xrXMvJnLymG4daXDrA8yiLSMlE=',
  'i3EeaAlnLAM13GHR2h3MQFnJcySK9we9WGJFCF6nCzI='
])

export const sameRaw = (a: string | undefined | null, b: string) => !!a && a.toLowerCase() === b.toLowerCase()

export const fragmentUsernameUrl = (name: string) => `https://fragment.com/username/${encodeURIComponent(name)}`
export const fragmentNumberUrl = (digits: string) => `https://fragment.com/number/${digits}`

/** "88807684929" → "+888 0768 4929" (Fragment's display form). */
export function formatAnonNumber(digits: string): string {
  const rest = digits.slice(3)
  return `+888 ${rest.match(/.{1,4}/g)?.join(' ') ?? ''}`.trim()
}

/** Raw or friendly → mainnet friendly (URL-safe). */
export const mainnetFriendly = (address: string, bounceable = true) => Address.parse(address).toString({ bounceable, urlSafe: true })
