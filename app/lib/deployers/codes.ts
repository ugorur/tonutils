// Official contract code for the deployer tools, copied from the build artifacts of the upstream repos.
// Hashes are checked in tests against WALLET_CODE_HASHES (live mainnet accounts) and against real deploy transactions.
import { Cell } from '@ton/core'

/** ton-blockchain/multisig-contract-v2 build/Multisig.compiled.json. The Order code inside is a public library (hash 6305a806…). */
export const MULTISIG_V2_CODE_B64 = 'te6cckECEgEABJUAART/APSkE/S88sgLAQIBYggCAgEgBgMCAWYFBAFZsMn+CgBAXACyFjPFgEBy//JiCLIywH0APQAywDJcAH5AHTIywISygfL/8nQgEQDxsMr7UTQ0/8BAdMHAQHU0wcBAfQE0gABAdEjf3COF1ESePR8b6UyIZlTArry4GcCpALeAbMS5mwhUjC68uBsIX9wjhdREnj0fG+lMiGZUwK68uBnAqQC3gGzEuZsITAiwgDy4G4kwgDy4G1SQ7vy4G0BkjN/kQPiA4AFDv3T/aiaGn/gIDpg4CA6mmDgID6AmkAAIDoiBqvgoD8EdDAcAwvgHA4MM+UEwA4MI+UEw+AdQBqGBJ/gBoHD4NoESBnD4NqCBK+xw+DaggR2YcPg2oCKmBiKggQU5JqAnoHD4OCOkgQKYJ6Bw+DigA6YGWKCBBuBQBaBQBaBDA3D4N1mgAaACytAz0NMDAXGwkl8D4PpAMCLXScAAkl8D4ALTHwEgwACSXwTgAdM/Ae1E0NP/AQHTBwEB1NMHAQH0BNIAAQHRKIIQ9xhRD7rjDwVEQ8hQBgHL/1AEAcsHEswBAcsH9AABAcoAye1UDQkCmjY4JoIQdQl/XbqOugaCEKMsWb+6jqn4KBjHBfLgZQPU0RA0EDZGUPgAf46NIXj0fG+lIJEy4w0Bs+ZbEDVQNJI0NuJQVBPjDUAVUDMECwoC4jYE0/8BAdMvAQHTBwEB0/8BAdTR+ChQBQFwAshYzxYBAcv/yYgiyMsB9AD0AMsAyXAB+QB0yMsCEsoHy//J0BvHBfLgZSb5ABq6UZO+GbDy4GYH+CO+8uBvRBRQVvgAf46NIXj0fG+lIJEy4w0Bs+ZbEQsB+gLXTNDTHwEgghDxOB5buo5qghAdDPvTuo5ebETTBwEB1CF/cI4XURJ49HxvpTIhmVMCuvLgZwKkAt4BsxLmbCEgwgDy4G4jwgDy4G1TMLvy4G0B9AQhf3COF1ESePR8b6UyIZlTArry4GcCpALeAbMS5mwhMNFVI5Ew4uMNDAAQMNMH1AL7ANEBnjgG0/8BKLOOEiCE/7qSMCSWUwW68uPw4gWkBd4B0gABAdMHAQHTLwEB1NEjkSaRKuJSMHj0Dm+h8uPvHscF8uPvIPgjvvLgbyD4I6FUbXAOAdT4BwODDPlBMAODCPlBMPgHUAahgSf4AaBw+DaBEgZw+DaggSvscPg2oIEdmHD4NqAipgYioIEFOSagJ6Bw+DgjpIECmCegcPg4oAOmBliggQbgUAWgUAWgQwNw+DdZoAGgHL7y4GT4KFADDwK4AXACyFjPFgEBy//JiCLIywH0APQAywDJcCH5AHTIywISygfL/8nQyIIQnHP7olgKAssfyz8mAcsHUlDMUAsByy8bzCoBygAKlRkBywcIkTDiECRwQImAGIBQ2zwREACSjkXIWAHLBVAFzxZQA/oCVHEjI+1E7UXtR59byFADzxfJE3dQA8trzMztZ+1l7WR0f+0RmHYBy2vMAc8X7UHt8QHy/8kB+wDbBghCAmMFqAYchWwszwXcsN9YFccUdYcFZ8q18EnjQLz1klHzraSsQg=='

/** ton-blockchain/vesting-contract build/VestingWallet.compiled.json (the code vesting.ton.org deploys). */
export const VESTING_CODE_B64 = 'te6cckECHAEAA/sAART/APSkE/S88sgLAQIBIAMCA7jygwjXGCDTH9Mf0x8C+CO78mTtRNDTH9Mf0/8wWrryoVAzuvKiAvkBQDP5EPKj+ADbPCDXSsABjpntRO1F7UeRW+1n7WXtZI6C2zztQe3xAfL/kTDi+EGk+GHbPBsUEwIBSBEEAgEgCAUCASAHBgINuYRts82zyBsaASm6Ri2zz4RfhG+Ef4SPhJ+Er4S/hEgbAgEgDgkCAWINCgIBagwLAS+ix2zz6RAHIygfL/8nQ+ESBAQj0Cm+hMYbAA+iX7UTQ1wsfgFLrTRtnjb8IkcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAbAgFuEA8AGa8d9qJoQBBrkOuFj8AAGa3OdqJoQCBrkOuF/8ADrNBsIiDXScFgkVvgAdDTAwFxsJFb4PpAMNs8AdMf0z/4S1JAxwUjghCnczrNurCOpGwS2zyCEPdzOs0BcIAYyMsFUATPFiP6AhPLassfyz/JgED7AOMOGxQSAc74SlJAxwUDghByWKabuhOwjtGOLAH6QH/IygAC+kQByMoHy//J0PhEECOBAQj0QfhkINdKwgAglQHUMNAB3rMS5oIQ8limmzJwgBjIywVQBM8WI/oCE8tqyx/LP8mAQPsA2zySXwPiEwBm+Ej4R/hG+EXIyz/LH8sfyx/4SfoC+ErPFvhLzxbJ+ET4Q/hC+EHIyx/LH8v/9ADMye1UAlzTB9TR+CPbPCDCAI6bIsAD8uBkIdDTA/pAMfpA+EpSIMcFs5JfBOMNkTDiAfsAGhUD+iH6RAHIygfL/8nQ+ESBAQj0Cm+hMY9fMwFysMAC8uBlAfoAMXHXIfoAMfoAMdM/MdMfMdMAAcAA8uBm0wABk9Qw0N4hcds8jiox0x8wIIIQTnN0S7ohghBHZXQkurEhghBWdENwurEBghBWb3RlurHy4GfjDnCSXwPiIMIAGRcWAA6TcvsCkTDiAuoBcNs8jm0g10nCAI5j0x8hwAAigwu6sSKBEAG6sSKCEEfVQ5G6sSKCEFlfB7y6sSKCEGn7MGy6sSKCEFZvdGW6sSKCEFZ0Q3C6sfLgZwHAACHXScIAsI4V0wcwIMBkIcB3sSHARLEBwFex8uBokTDikTDi4w0ZGAAa0x8wghBWb3RluvLgZwBEAfpEAcP/kltw4AH4MyBukltw4NAg10mDB7mSW3Dg1wv/ugBg+EX4RqBSELySMHDg+EX4SKBSELmTMPhJ4PhJ+En4RROh+EepBPhG+EepBBAjqYShAH7tRNDTHwH4YdMfAfhi0/8B+GP0BAH4ZNQB0NM/Afhl0x8B+GbTHwH4Z9MfAfho+gAB+Gn6QAH4avpAAfhr0dEKIMan'

/**
 * ton-blockchain/multisig-contract-v2 contracts/helper/librarian.func (build/Librarian.compiled.json): its data is the
 * library cell. On any message it reserves 10 years of masterchain storage for that cell, returns the rest to the sender,
 * publishes the cell with SETLIBCODE mode 2 (public) and replaces its own code and data with empty cells.
 */
export const LIBRARIAN_CODE_B64 = 'te6cckEBBAEAmQABFP8A9KQT9LzyyAsBA37TMDHQ0wMBMPpAMO1E+AchgQPo+UEw+AdQA6F/+DsCghASzAMAf/g3oIAQ+wIBcMiAEIMG2zxy+waI+wSI7VQDAgIAAACIjkDIWAHLBVAEzxZY+gJUcSDtRO1F7UedW8hQA88XyRJxWMtqzO1n7WXtZHN/7RGXcAHLagHPF+1B7fEB8v/JAfsA2wWv0xlZ'

/**
 * ton-blockchain/multisig-contract-v2 build/Order.compiled.json: a real public library (hash 6305a806…, returned by toncenter
 * /api/v2/getLibraries on mainnet and testnet). Mainnet tx 6dJ9QiUiUyXEGAX28qun8UM/duZhfyjXWZ98zi5CZUU= sent it to the librarian below.
 */
export const ORDER_CODE_B64 = 'te6cckECDAEAA3YAART/APSkE/S88sgLAQIBYgMCAMehx3HaiaH0gAPww6f+A/DEQa6TgAEcLGDb8Mbb8Mjb8Mrb8Mzb8M7b8NDb8NMcRaYOA/DHpAAD8MmoA/DLp/4D8M2mDgPwz6ZeA/DRqAPw06PF8IPwhfCH8Inwi/CN8I/wkfCTA/jQMzHQ0wMBcbCRW+D6QDAB0x8B7UTQ+kAB+GHT/wH4YiDXScAAjhYwbfhjbfhkbfhlbfhmbfhnbfhobfhpjiLTBwH4Y9IAAfhk1AH4ZdP/Afhm0wcB+GfTLwH4aNQB+GnR4iDAAOMCAdM/ASKCEJxz+6K64wICghCnYiMPBwUEAUq6jpvTBwEB0fhFUhB49A5vofLgalIwxwXy4GpZ2zzgXwOED/LwCAL+MvhBE8cF8uBo+ENujvEB0wcB+GNw+GTUAfhlcPhmcPhn0y8B+Gj4SPgjvvLgb9QB+GnSAAGOmdMHAa74RiGw8tBr+Eek+Gf4RgGx+GYB2zyRMeLR+En4RvhFyPhBzxb4QgHL//hDAcsH+EQBygDMy//4RwHLB/hIAcsvzMntVAoGAYzgAdMHAfhDuvLgadQB+QD4RfkAuvLgadMvAfhIuvLgadQB+QD4SfkAuvLgadIAAfLgadMHAQHR+EVSEHj0Dm+h8uBqWNs8CAHIMCDXSsAAjiPIcI4aItdJUjDXGRLPFiLXSpQC10zQkzF/WOJUEiDmMDHJ0N+EDwGLdhcHByb3ZljHBfL0IHB/jhn4RXj0fG+lIJtSQ8cFlTF/MnAB3pEy4gGz5jLy4Gr4JRLbPAgCbo8zXO1E7UXtR46YMXDIghCvryg+WAQCyx/LP8sfgBCAUNs87WftZe1kcn/tEYrtQe3xAfL/2wMLCQK0+ETy0HACrvhGIbDy0Gv4R6T4Z/hGAbH4ZnDIghCCYJv2JALLH8s/gBCAUNs82zz4SfhG+EXI+EHPFvhCAcv/+EMBywf4RAHKAMzL//hHAcsH+EgByy/Mye1UCwoBgPhH+EO6jrb4QXD4SciCEHUJf11YBQLLH8s/+EIBy//4SAHLL/hHAcsH+EX5AAHL/xPMEoAQgQCQ2zx/+GSRMOILAIiOQMhYAcsFUATPFlj6AlRxIO1E7UXtR51byFADzxfJEnFYy2rM7WftZe1kc3/tEZdwActqAc8X7UHt8QHy/8kB+wDbBUX4Ahw='

/** librarian.func DEFAULT_DURATION: storage the librarian pays for up front. */
export const LIBRARIAN_DURATION = 3600 * 24 * 365 * 10

let cache: { multisig: Cell, vesting: Cell, librarian: Cell } | null = null

/** Parsed lazily: @ton/core needs Buffer, which is ready only once the tool runs. */
export function codes() {
  cache ??= {
    multisig: Cell.fromBase64(MULTISIG_V2_CODE_B64),
    vesting: Cell.fromBase64(VESTING_CODE_B64),
    librarian: Cell.fromBase64(LIBRARIAN_CODE_B64)
  }
  return cache
}

/** One address per line (commas and spaces also split). Empty lines are ignored. */
export function splitLines(text: string): string[] {
  return text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
}
