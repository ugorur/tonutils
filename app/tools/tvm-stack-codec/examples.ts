// Real get-method results read on 2026-10-22 (mainnet).
// get_jetton_data on hGRAM master EQDPdq8xjAhytYqfGSX8KcFWIReCufsB9Wdg0pLlYSO_h76w, from toncenter /api/v2/runGetMethod
// (the redundant "object" field of each cell is dropped), toncenter /api/v3/runGetMethod and tonapi /v2/blockchain/…/methods.
export const JETTON_DATA_V2 = [
  [
    "num",
    "0x17bc2e9be61419"
  ],
  [
    "num",
    "-0x1"
  ],
  [
    "cell",
    {
      bytes: "te6cckEBAQEAJAAAQ4AReTI5/C73j9LkKGffR336MykLSrn/oIFA2RNeBNbjefAr4RW/"
    }
  ],
  [
    "cell",
    {
      bytes: "te6cckECDwEAASgAAQMAwAECASACAwFDv/CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewAQCASAFBgA+AGh0dHBzOi8vaGlwby5maW5hbmNlL2hncmFtLnN2ZwIBIAcIAgEgCwwBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwkBQb9u1PlCp4SM4ssGa3ehEoxqH/jEP0OKLc4kYSup/6uLAwoAIgBIaXBvIFN0YWtlZCBHUkFNAAwAaEdSQU0BQb9SCN70b1odT53OZqswn0qFEwXxZvke952SPvWONPmiCQ0BQb9dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfQ4AMABIaXBvIGxpcXVpZCBzdGFrZWQgR1JBTQAEADktdi/F"
    }
  ],
  [
    "cell",
    {
      bytes: "te6cckEBAQEAIwAIQgJo3w4PQX+l4jph6lnMwGAJ9MaHthLppbbJkqtGKLGBq4QSs9s="
    }
  ]
]

export const JETTON_DATA_V3 = [
  {
    type: "num",
    value: "0x17bc2e9be61419"
  },
  {
    type: "num",
    value: "-0x1"
  },
  {
    type: "cell",
    value: "te6cckEBAQEAJAAAQ4AReTI5/C73j9LkKGffR336MykLSrn/oIFA2RNeBNbjefAr4RW/"
  },
  {
    type: "cell",
    value: "te6cckECDwEAASgAAQMAwAECASACAwFDv/CC62Y7V6ABkvSmrEZyiN8t/t252hvuKPZSHIvr0h8ewAQCASAFBgA+AGh0dHBzOi8vaGlwby5maW5hbmNlL2hncmFtLnN2ZwIBIAcIAgEgCwwBQb9FRqb/4bec/dhrrT24dDE9zeL7BeanSqfzVS2WF8edEwkBQb9u1PlCp4SM4ssGa3ehEoxqH/jEP0OKLc4kYSup/6uLAwoAIgBIaXBvIFN0YWtlZCBHUkFNAAwAaEdSQU0BQb9SCN70b1odT53OZqswn0qFEwXxZvke952SPvWONPmiCQ0BQb9dAfpePAaQHEUEbGst3Opa92T+oO7XKhDUBPIxLOskfQ4AMABIaXBvIGxpcXVpZCBzdGFrZWQgR1JBTQAEADktdi/F"
  },
  {
    type: "cell",
    value: "te6cckEBAQEAIwAIQgJo3w4PQX+l4jph6lnMwGAJ9MaHthLppbbJkqtGKLGBq4QSs9s="
  }
]

export const JETTON_DATA_TONAPI = [
  {
    type: "num",
    num: "0x17bc2e9be61419"
  },
  {
    type: "num",
    num: "-0x1"
  },
  {
    type: "cell",
    cell: "b5ee9c720101010100240000438011793239fc2ef78fd2e42867df477dfa33290b4ab9ffa08140d9135e04d6e379f0"
  },
  {
    type: "cell",
    cell: "b5ee9c7201020f0100012800010300c00102012002030143bff082eb663b57a00192f4a6ac467288df2dfeddb9da1bee28f6521c8bebd21f1ec0040201200506003e0068747470733a2f2f6869706f2e66696e616e63652f686772616d2e73766702012007080201200b0c0141bf4546a6ffe1b79cfdd86bad3db874313dcde2fb05e6a74aa7f3552d9617c79d13090141bf6ed4f942a7848ce2cb066b77a1128c6a1ff8c43f438a2dce24612ba9ffab8b030a0022004869706f205374616b6564204752414d000c00684752414d0141bf5208def46f5a1d4f9dce66ab309f4a851305f166f91ef79d923ef58e34f9a2090d0141bf5d01fa5e3c06901c45046c6b2ddcea5af764fea0eed72a10d404f2312ceb247d0e0030004869706f206c6971756964207374616b6564204752414d00040039"
  },
  {
    type: "cell",
    cell: "b5ee9c720101010100230008420268df0e0f417fa5e23a61ea59ccc06009f4c687b612e9a5b6c992ab4628b181ab"
  }
]

// past_election_ids on the elector Ef8zMzMz…M0vF: a Lisp list of two ids. toncenter flattens it to "list".
export const ELECTIONS_V2 = [
  [
    "list",
    {
      '@type': "tvm.list",
      elements: [
        {
          '@type': "tvm.stackEntryNumber",
          number: {
            '@type': "tvm.numberDecimal",
            number: "1792626440"
          }
        },
        {
          '@type': "tvm.stackEntryNumber",
          number: {
            '@type': "tvm.numberDecimal",
            number: "1792691976"
          }
        }
      ]
    }
  ]
]

export const ELECTIONS_V3 = [
  {
    type: "list",
    value: [
      {
        type: "num",
        value: "0x6ad94f08"
      },
      {
        type: "num",
        value: "0x6ada4f08"
      }
    ]
  }
]

export const ELECTIONS_TONAPI = [
  {
    type: "tuple",
    tuple: [
      {
        type: "num",
        num: "0x6ad94f08"
      },
      {
        type: "tuple",
        tuple: [
          {
            type: "num",
            num: "0x6ada4f08"
          },
          {
            type: "null"
          }
        ]
      }
    ]
  }
]

