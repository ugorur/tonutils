// Real signatures used as "Try an example" inputs and test vectors.
import { beginCell, storeStateInit } from '@ton/core'
import { WalletContractV4 } from '@ton/ton'

/**
 * Real proof signed by a v4R2 wallet on the official TonConnect demo dApp (ton-connect.github.io), 2025-05-15.
 * Source: xssnick/tonutils-go ton/wallet/proof_test.go (testData), reshaped as the demo backend's CheckProofRequest.
 */
export const EXAMPLE_PROOF = {
  address: '0:960ab627408d5472d9d125b667cbe00ce17eeaa44e9dc6a86e93cdfef2c480d5',
  network: '-239',
  proof: {
    timestamp: 1747303893,
    domain: { lengthBytes: 21, value: 'ton-connect.github.io' },
    payload: '1747303885:',
    signature: 'OXNmXOa6Ml5mgx13CXVunl5TjQiIl2oYq8dn9MUcBiS6OjZcuJYccqqVMluy0duyOXkoJYHg4VJCyycwkjdJBA==',
    state_init: 'te6cckECFgEAAwQAAgE0AgEAUQAAAAApqaMXp6kMOCJ4z0QdKdtKvLvoflXmJvj/gmw26izx4ImGnYtAART/APSkE/S88sgLAwIBIAgEBPjygwjXGCDTH9Mf0x8C+CO78mTtRNDTH9Mf0//0BNFRQ7ryoVFRuvKiBfkBVBBk+RDyo/gAJKTIyx9SQMsfUjDL/1IQ9ADJ7VT4DwHTByHAAJ9sUZMg10qW0wfUAvsA6DDgIcAB4wAhwALjAAHAA5Ew4w0DpMjLHxLLH8v/BwYQBQAK9ADJ7VQAcIEBCNcY+gDTP8hUIEeBAQj0UfKnghBub3RlcHSAGMjLBcsCUAbPFlAE+gIUy2oSyx/LP8lz+wACAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAgFIDQkCASALCgBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgEgEQwAEbjJftRNDXCx+ALm0AHQ0wMhcbCSXwTgItdJwSCSXwTgAtMfIYIQcGx1Z70ighBkc3RyvbCSXwXgA/pAMCD6RAHIygfL/8nQ7UTQgQFA1yH0BDBcgQEI9ApvoTGzkl8H4AXTP8glghBwbHVnupI4MOMNA4IQZHN0crqSXwbjDQ8OAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+IAeAH6APQEMPgnbyIwUAqhIb7y4FCCEHBsdWeDHrFwgBhQBMsFJs8WWPoCGfQAy2kXyx9SYMs/IMmAQPsABgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAgFYFRICASAUEwAZrx32omhAEGuQ64WPwAAZrc52omhAIGuQ64X/wAA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYHrKDBA='
  }
}

/**
 * Real TonConnect signData (binary "Hello, TON!") from a v4R2 wallet on ton-connect.github.io. Source: near/intents
 * crates/signatures/ton-connect/src/lib.rs. The wallet was never deployed, so the bundle carries its StateInit
 * (built by @ton/ton for the same key; it hashes to the signer address).
 */
export function exampleSignData() {
  const publicKey = Buffer.from('22e795a07e832fc9084ca35a488a711f1dbedef637d4e886a6997d93ee2c2e37', 'hex')
  const w = WalletContractV4.create({ workchain: 0, publicKey })
  return {
    signature: Buffer.from('9cf4c1c16b47afce46940eb9cd410894f31544b74206c2254bb1651f9b32cf5b0e482b78a2e8251e54d3517fae4b06c6f23546667d63ff62dccce70451698d01', 'hex').toString('base64'),
    address: '0:f4809e5ffac9dc42a6b1d94c5e74ad5fd86378de675c805f2274d0055cbc9378',
    timestamp: 1747760435,
    domain: 'ton-connect.github.io',
    payload: { type: 'binary', bytes: Buffer.from('Hello, TON!').toString('base64') },
    publicKey: publicKey.toString('hex'),
    walletStateInit: beginCell().store(storeStateInit(w.init)).endCell().toBoc().toString('base64')
  }
}
