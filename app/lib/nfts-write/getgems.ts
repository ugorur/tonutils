// Getgems contracts (https://github.com/getgems-io/nft-contracts, MIT): compiled code and code hashes.
// Code BOCs are copied verbatim from packages/contracts/nft-collection/NftCollection.source.ts and
// nft-item/NftItem.source.ts. Hashes were matched against live mainnet accounts (toncenter v3, 2026-10-22).

/** nft-collection-editable.fc: owner can mint (op 1), batch mint (op 2), change owner (op 3), edit content (op 4). */
export const COLLECTION_CODE_B64 = 'te6cckECFAEAAh8AART/APSkE/S88sgLAQIBYgkCAgEgBAMAJbyC32omh9IGmf6mpqGC3oahgsQCASAIBQIBIAcGAC209H2omh9IGmf6mpqGAovgngCOAD4AsAAvtdr9qJofSBpn+pqahg2IOhph+mH/SAYQAEO4tdMe1E0PpA0z/U1NQwECRfBNDUMdQw0HHIywcBzxbMyYAgLNDwoCASAMCwA9Ra8ARwIfAFd4AYyMsFWM8WUAT6AhPLaxLMzMlx+wCAIBIA4NABs+QB0yMsCEsoHy//J0IAAtAHIyz/4KM8WyXAgyMsBE/QA9ADLAMmAE59EGOASK3wAOhpgYC42Eit8H0gGADpj+mf9qJofSBpn+pqahhBCDSenKgpQF1HFBuvgoDoQQhUZYBWuEAIZGWCqALnixJ9AQpltQnlj+WfgOeLZMAgfYBwGyi544L5cMiS4ADxgRLgAXGBEuAB8YEYGYHgAkExIREAA8jhXU1DAQNEEwyFAFzxYTyz/MzMzJ7VTgXwSED/LwACwyNAH6QDBBRMhQBc8WE8s/zMzMye1UAKY1cAPUMI43gED0lm+lII4pBqQggQD6vpPywY/egQGTIaBTJbvy9AL6ANQwIlRLMPAGI7qTAqQC3gSSbCHis+YwMlBEQxPIUAXPFhPLP8zMzMntVABgNQLTP1MTu/LhklMTugH6ANQwKBA0WfAGjhIBpENDyFAFzxYTyz/MzMzJ7VSSXwXiN0CayQ=='
export const COLLECTION_CODE_HASH = 'ZLstRmG18twag79cu+CekqwLRgobh5pVGThvykw0i8o='

/** nft-item.fc: the standard TEP-62 item used by most collections (TON Diamonds and ~3/4 of standard collections). */
export const ITEM_CODE_B64 = 'te6cckECDQEAAdAAART/APSkE/S88sgLAQIBYgMCAAmhH5/gBQICzgcEAgEgBgUAHQDyMs/WM8WAc8WzMntVIAA7O1E0NM/+kAg10nCAJp/AfpA1DAQJBAj4DBwWW1tgAgEgCQgAET6RDBwuvLhTYALXDIhxwCSXwPg0NMDAXGwkl8D4PpA+kAx+gAxcdch+gAx+gAw8AIEs44UMGwiNFIyxwXy4ZUB+kDUMBAj8APgBtMf0z+CEF/MPRRSMLqOhzIQN14yQBPgMDQ0NTWCEC/LJqISuuMCXwSED/LwgCwoAcnCCEIt3FzUFyMv/UATPFhAkgEBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7AAH2UTXHBfLhkfpAIfAB+kDSADH6AIIK+vCAG6EhlFMVoKHeItcLAcMAIJIGoZE24iDC//LhkiGOPoIQBRONkchQCc8WUAvPFnEkSRRURqBwgBDIywVQB88WUAX6AhXLahLLH8s/Im6zlFjPFwGRMuIByQH7ABBHlBAqN1viDACCAo41JvABghDVMnbbEDdEAG1xcIAQyMsFUAfPFlAF+gIVy2oSyx/LPyJus5RYzxcBkTLiAckB+wCTMDI04lUC8ANqhGIu'
export const ITEM_CODE_HASH = 'TJEjgoaC+m9DeXq0FzK8qJDK4Bdm4GdBACUFFuC/jUI='

export type SaleVersion = 'v2' | 'v3' | 'v3r2' | 'v3r3' | 'v4r1'

export interface SaleKind {
  version: SaleVersion
  label: string
  /** Minimum value the contract demands with a cancel (min_gas_amount in its source). Most of it comes back with the NFT. */
  cancelAmount: bigint
  /** The owner can change the price in place (op 0x6c6c2080 in v3r3, 0xfd135f7b in v4r1). */
  canReprice: boolean
}

/** Fixed-price sale contracts by base64 code hash. Cancel is op 3 + query_id in all of them, sent by the seller. */
export const SALE_KINDS: Record<string, SaleKind> = {
  'gnj0xSM95vvtyWmvUZNEp6m//FRIVtuphqlcC8+Fcck=': { version: 'v2', label: 'Getgems fixed price v2', cancelAmount: 1_000_000_000n, canReprice: false },
  'MgUN+sRPZIZrzIbyzZ4TBf6dyts5WcACI3z7CQLUQyM=': { version: 'v3', label: 'Getgems fixed price v3', cancelAmount: 1_000_000_000n, canReprice: false },
  '3rU7bFdlwebNI4v0e8XoO6WWvcwEsLhM1Qqx5HSgjzE=': { version: 'v3r2', label: 'Getgems fixed price v3r2', cancelAmount: 1_000_000_000n, canReprice: false },
  'JCIfpXHlQuBVx3vt/b9SfHr0YM/cfzRMRQeHtM+h600=': { version: 'v3r3', label: 'Getgems fixed price v3r3', cancelAmount: 100_000_000n, canReprice: true },
  'a5WmQYucnSNZBF0edVm41UmuDlBvJMqrWPowyPsf64Y=': { version: 'v4r1', label: 'Getgems fixed price v4r1', cancelAmount: 100_000_000n, canReprice: true }
}

/** Getgems auctions: recognised for labelling only; this site does not cancel them (bids, deadlines). */
export const AUCTION_KINDS: Record<string, string> = {
  '/ACindAgW83MDT/7nKOMw8jBWexg2KpUMkCpLxBZLUA=': 'Getgems auction v1',
  'ZmiHL6eXBUQ//UdSPo6eqfdquZ+aC1nSfej4GhwnudQ=': 'Getgems auction v2',
  'G9nFo5v/t6DzQViLXdkrgTqEK/Ze8UEJOCIAzq+Pct8=': 'Getgems auction v3r2',
  'u29ireD+stefqzuK6/CTCvmFU99gCTsgJ/Covxab/Ow=': 'Getgems auction v3r3',
  'zlp4U06qps7tja/UhtB262CpsNbb+1Nnb2YmScBomVY=': 'Getgems auction v4r1'
}
