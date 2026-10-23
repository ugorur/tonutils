// TL-B presets shared by the TL-B playground and the TL-B → TypeScript generator.
// Schemas follow the published TEPs; `example` BOCs are real mainnet data (source noted on each).

export interface TlbPreset {
  id: string
  label: string
  /** null: use tlb-runtime's bundled block.tlb (loaded lazily, ~800 lines). */
  schema: string | null
  example?: { boc: string, type: string, note: string }
  /** false: the schema is simplified for the runtime in a way tlb-codegen cannot use (ambiguous `$_` constructors). */
  codegen?: false
}

const COMMON = `// TL-B helpers from block.tlb
nothing$0 {X:Type} = Maybe X;
just$1 {X:Type} value:X = Maybe X;
left$0 {X:Type} {Y:Type} value:X = Either X Y;
right$1 {X:Type} {Y:Type} value:Y = Either X Y;
`

export const TLB_PRESETS: TlbPreset[] = [
  {
    id: 'tep74',
    label: 'Jettons (TEP-74)',
    schema: `${COMMON}
// TEP-74 jetton wallet messages
transfer#0f8a7ea5 query_id:uint64 amount:(VarUInteger 16) destination:MsgAddress
  response_destination:MsgAddress custom_payload:(Maybe ^Cell)
  forward_ton_amount:(VarUInteger 16) forward_payload:(Either Cell ^Cell)
  = InternalMsgBody;
transfer_notification#7362d09c query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress
  forward_payload:(Either Cell ^Cell) = InternalMsgBody;
excesses#d53276db query_id:uint64 = InternalMsgBody;
burn#595f07bc query_id:uint64 amount:(VarUInteger 16) response_destination:MsgAddress
  custom_payload:(Maybe ^Cell) = InternalMsgBody;
internal_transfer#178d4519 query_id:uint64 amount:(VarUInteger 16) from:MsgAddress
  response_address:MsgAddress forward_ton_amount:(VarUInteger 16)
  forward_payload:(Either Cell ^Cell) = InternalMsgBody;
burn_notification#7bdd97de query_id:uint64 amount:(VarUInteger 16) sender:MsgAddress
  response_destination:MsgAddress = InternalMsgBody;
`,
    example: {
      // toncenter v3 /messages, msg hash hIg7u6K7FBm2FekLgjS0VLgtWqHPWUaPJ2z37uyAwYk=
      boc: 'te6cckEBAQEAVgAAqA+KfqUAAAAAAAAAAzEQJHgAQEUh9fOQoPOGrW2klsaToVKi8mzRgTn7K0mqxwaa3dMACQKbb0g6rfdWJQ2LZZAj4PT/Xonrcl0suRR3NsZ8lu8CAg8x3tM=',
      type: 'InternalMsgBody',
      note: 'A real jetton transfer from mainnet'
    }
  },
  {
    id: 'tep62',
    label: 'NFTs (TEP-62)',
    schema: `${COMMON}
// TEP-62 NFT item and collection messages
transfer#5fcc3d14 query_id:uint64 new_owner:MsgAddress response_destination:MsgAddress
  custom_payload:(Maybe ^Cell) forward_amount:(VarUInteger 16)
  forward_payload:(Either Cell ^Cell) = InternalMsgBody;
ownership_assigned#05138d91 query_id:uint64 prev_owner:MsgAddress
  forward_payload:(Either Cell ^Cell) = InternalMsgBody;
excesses#d53276db query_id:uint64 = InternalMsgBody;
get_static_data#2fcb26a2 query_id:uint64 = InternalMsgBody;
report_static_data#8b771735 query_id:uint64 index:uint256 collection:MsgAddress = InternalMsgBody;
`,
    example: {
      // toncenter v3 /messages, msg hash A5wxgNhTPzbbF9W3ZLkoyOcRJ3J/nUvT+612YvM0wZ8=
      boc: 'te6cckEBAQEAUgAAn1/MPRQAAAAAAAAADoARV0XwwcNvugjDLlxZME2dzP38df6ZIxf+tY6vPkVmVJADCNwjGlMioMvMqB8uKuBFyN202Zny9V4i/SOesSyCfyQITYRhLQ==',
      type: 'InternalMsgBody',
      note: 'A real NFT transfer from mainnet'
    }
  },
  {
    id: 'tep64',
    label: 'Token metadata layout (TEP-64)',
    schema: `// TEP-64 content layout. Simplified for the runtime: snake and chunked values stay raw cells,
// because it cannot track dependent types like SnakeData ~n. Dictionary keys are sha256(key name).
snake#00 data:Cell = ContentData;
chunks#01 data:(HashmapE 32 ^Cell) = ContentData;
onchain#00 data:(HashmapE 256 ^ContentData) = FullContent;
offchain#01 uri:Cell = FullContent;
`,
    example: {
      // get_jetton_data of the USD₮ master EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs (toncenter v3 runGetMethod)
      boc: 'te6cckEBBwEAfQABAwDAAQIBIAIDAUO/+HLr21FNnJfCg7fwrlF5Ap4rYRnDlGJxnk9G7Y90E+ZABAFDv/dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfQAYBAgAFAD5odHRwczovL3RldGhlci50by91c2R0LXRvbi5qc29uAAQANhfFQ3M=',
      type: 'FullContent',
      note: 'The USD₮ jetton content cell (on-chain dict with uri and decimals)'
    }
  },
  {
    id: 'w5',
    label: 'Wallet W5 external request',
    codegen: false,
    schema: `// Wallet v5r1 signed request (ton-blockchain/wallet-contract-v5). Simplified for the runtime:
// OutList drops its length parameter and lists out_list first; messages and extended actions stay raw cells.
out_list$_ prev:^OutList action:OutAction = OutList;
out_list_empty$_ = OutList;
action_send_msg#0ec3c86d mode:(## 8) out_msg:^Cell = OutAction;
action_set_code#ad4de08e new_code:^Cell = OutAction;
action_reserve_currency#36e6b809 mode:(## 8) currency:Cell = OutAction;

nothing$0 {X:Type} = Maybe X;
just$1 {X:Type} value:X = Maybe X;

actions$_ out_actions:(Maybe ^OutList) has_other_actions:(## 1) = InnerRequest;
signed_request$_ wallet_id:uint32 valid_until:uint32 msg_seqno:uint32
  inner:InnerRequest signature:bits512 = SignedRequest;
internal_signed#73696e74 signed:SignedRequest = InternalMsgBody;
external_signed#7369676e signed:SignedRequest = ExternalMsgBody;
`,
    example: {
      // toncenter v3 /messages, external message J7d1lRwZA4OHjpELMXCR1On/KwP8bnKPUpGUCMMA9C4= to a W5 wallet
      boc: 'te6cckECCAEAAS8AAaFzaWduf///EWraQAoAAAAHsBW6IAt4hr41taIGBl6m/R6jPTN+MGrfKXBfF3nzsNOQ4Ss7zrM2Du/CDmFddiBX3el6cg+dsm+Knvw9jfYwg+ABAgoOw8htAwIDAAABaGIAPsCl05M2OBguwdxc4w4guf6+vqcnUopItobfCQFhIZQgjw0YAAAAAAAAAAAAAAAAAAEEAbIPin6lOuwtlH41QlBQfqYnaogAaZDzTw8iPocZVUEqlyroPlpyZ0QZp99DsQcV/CTLFZkAPXvzQlLwtWfVATY2SjcyixFcmj0HyTacepOqDQtGqP1IHc1lAQUBVeOg1IKAHfMBGraPd8N9vfm4YUhfhVdK1P+d0jUnVP8s3BNCMxqEdp0++EAGAglq2kzmDgcHAAguHPqCUzGTHQ==',
      type: 'ExternalMsgBody',
      note: 'A real W5 transfer request (seqno 7, one send_msg action)'
    }
  },
  {
    id: 'block',
    label: 'block.tlb (full)',
    schema: null,
    example: {
      // init_state of toncenter v3 message TIoMCjbdSC0NmSkOrE8OXpPX0I435+8pVG9sVGwP7UY=; its hash is the account 0:B41BEF5A…CE42
      boc: 'te6cckECFgEAArEAAgE0AQIBFP8A9KQT9LzyyAsDAFGAAAAAP///iNXBzJcHy8UhYY6Anf8mYpxfaMgkrrM5koYoK0iZWQGCIAIBIAQFAgFIBgcBAvIQAtzQINdJwSCRW49jINcLHyCCEGV4dG69IYIQc2ludL2wkl8D4IIQZXh0brqOtIAg1yEB0HTXIfpAMPpE+Cj6RDBYvZFb4O1E0IEBQdch9AWDB/QOb6ExkTDhgEDXIXB/2zzgMSDXSYECgLmRMOBw4hIRAgEgCAkCASAKCwAZvl8PaiaECAoOuQ+gLAIBbgwNAgFIDg8AGa3OdqJoQCDrkOuF/8AAGa8d9qJoQBDrkOuFj8AAF7Ml+1E0HHXIdcLH4AARsmL7UTQ1woAgAR4g1wsfghBzaWduuvLgin8RAeaO8O2i7fshgwjXIgKDCNcjIIAg1yHTH9Mf0x/tRNDSANMfINMf0//XCgAK+QFAzPkQmiiUXwrbMeHywIffArNQB7Dy0IRRJbry4IVQNrry4Ib4I7vy0IgikvgA3gGkf8jKAMsfAc8Wye1UIJL4D95w2zzYEgP27aLt+wL0BCFukmwhjkwCIdc5MHCUIccAs44tAdcoIHYeQ2wg10nACPLgkyDXSsAC8uCTINcdBscSwgBSMLDy0InXTNc5MAGk6GwShAe78uCT10rAAPLgk+1V4tIAAcAAkVvg69csCBQgkXCWAdcsCBwS4lIQseMPINdKExQVAJYB+kAB+kT4KPpEMFi68uCR7UTQgQFB1xj0BQSdf8jKAEAEgwf0U/Lgi44UA4MH9Fvy4Iwi1woAIW4Bs7Dy0JDiyFADzxYS9ADJ7VQAcjDXLAgkji0h8uCS0gDtRNDSAFETuvLQj1RQMJExnAGBAUDXIdcKAPLgjuLIygBYzxbJ7VST8sCN4gAQk1vbMeHXTNBEztbh',
      type: 'StateInit',
      note: 'A real W5 wallet deploy StateInit'
    }
  },
  {
    id: 'simple',
    label: 'Minimal example',
    schema: `// tlb-runtime README example: one 32-bit field
_ x:# = Foo;
`,
    example: { boc: 'te6cckEBAQEABgAACAAAACoFpvBE', type: 'Foo', note: 'x = 42' }
  }
]
