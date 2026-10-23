// Test contract from the tolk-js 1.5.0 test suite (github.com/ton-blockchain/tolk-js, tests/contracts + tests/imports).
// tests/tolk-js.spec.ts expects its code cell hash to be CODE_HASH_BASE64.
import type { SourceFile } from '../files'

export const CODE_HASH_BASE64 = 'Bg+vB15TzyHO+CoGkTUbOAJbJEthskyCowQISlng0fI='

export const files: SourceFile[] = [
  {
    "path": "contracts/wallet-code.tolk",
    "content": "// Simple wallet smart contract\nimport \"@stdlib/gas-payments\"\nimport \"@stdlib/tvm-lowlevel\"\nimport \"../imports/wallet-helpers\"\nimport \"../imports/./wallet-storage.tolk\"\n\ncontract WalletT {\n}\n\nfun onInternalMessage(inMsg: slice) {\n  // do nothing for internal messages\n}\n\nfun onExternalMessage(inMsg: slice) {\n  var signature = inMsg.loadBits(512);\n  var cs = inMsg;\n  var (msgSeqno, validUntil) = (cs.loadUint(32), cs.loadUint(32));\n  assert(!(validUntil <= blockchain.now())) throw 35;\n  var st = Storage.fromCell(contract.getData());\n  assert(msgSeqno == st.seqno) throw 33;\n  assert(isSignatureValid(inMsg.hash(), signature, st.publicKey)) throw 34;\n  acceptExternalMessage();\n  cs.stackMoveToTop();\n  while (cs.remainingRefsCount() != 0) {\n    var mode = cs.loadUint(8);\n    sendRawMessage(cs.loadRef(), mode)\n  }\n  cs.assertEnd();\n  st.seqno += 1;\n  contract.setData(st.toCell());\n}\n\n// Get methods\n\nget fun seqno(): int {\n  return contract.getData().beginParse().preloadUint(32)\n}\n\nget fun get_public_key(): int {\n  var cs = contract.getData().beginParse();\n  cs.loadUint(32);\n  return cs.preloadUint(256);\n}\n"
  },
  {
    "path": "imports/wallet-helpers.tolk",
    "content": "import \"wallet-storage\"\nimport \"./wallet-nothing\"\n\n// test that relative imports work, compilation doesn't fail\nfun doNothing(s: Storage, d: Nothing) {\n}\n"
  },
  {
    "path": "imports/wallet-storage.tolk",
    "content": "struct Storage {\n    seqno: uint32\n    publicKey: uint256\n}\n\n"
  },
  {
    "path": "imports/wallet-nothing.tolk",
    "content": "struct Nothing\n"
  }
]
