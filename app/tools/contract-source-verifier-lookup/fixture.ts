// Real verifier.ton.org /api/v1/verification/source?code_hash=18d5b6e7… response for the USDT jetton master
// (EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs), fetched 2026-10-22. File contents trimmed to 60 chars. Test-only.
export const USDT_MASTER_VERIFIER = {
  "code_hash": "18d5b6e780ff0bb451254c2c760d09d6e485638cd1407abb97078752c3c1c9ee",
  "verified": true,
  "bundle": {
    "source_bundle_hash": "77e13e7e25bebbb5a3d85003ec5a624e15e890dad1afc5850eab3aaa9bf628eb",
    "verified_at": 1712070000,
    "storage_revision": "8e8e60cfd201edfbac2dfeef1cc986165f8ea34e",
    "entrypoint": "jetton-minter.fc",
    "compiler": {
      "language": "func",
      "version": "0.4.4-newops.1",
      "params": {
        "compiler_version": "0.4.4-newops.1"
      }
    },
    "source_map": null,
    "files": [
      {
        "path": "gas.fc",
        "content_hash": "3527cb3e34ecd36d9c900a57bf63462ff01c966423f9d1dd431b0ad1d5cb46a7",
        "include_in_command": true,
        "is_stdlib": false,
        "has_include_directives": true,
        "content": "#include \"workchain.fc\";\n\nconst ONE_TON = 1000000000;\n\nconst…"
      },
      {
        "path": "jetton-minter.fc",
        "content_hash": "c04626f422660f4ad0024c59316130911f08a9cf6a354b2d3dbd6aff233a87f9",
        "include_in_command": true,
        "is_stdlib": false,
        "has_include_directives": true,
        "content": ";; Jetton minter smart contract\n\n#pragma version >=0.4.3;\n\n#…"
      },
      {
        "path": "jetton-utils.fc",
        "content_hash": "1d7c540447aa38ccd0f49639c733f0bd801e7da6f468177b45429d673527274c",
        "include_in_command": true,
        "is_stdlib": false,
        "has_include_directives": true,
        "content": "#include \"workchain.fc\";\n\nconst int STATUS_SIZE = 4;\n\ncell p…"
      },
      {
        "path": "op-codes.fc",
        "content_hash": "1303e3b14603733689af085881ecb0e2f9b9c8fcfae1e5ba466a13cccc976171",
        "include_in_command": true,
        "is_stdlib": false,
        "has_include_directives": false,
        "content": ";; common\n\nconst op::transfer = 0xf8a7ea5;\nconst op::transfe…"
      },
      {
        "path": "stdlib.fc",
        "content_hash": "974636ef81a198a01934374dfbc4615d9b7cfaed05ea6281859898f217049b0c",
        "include_in_command": true,
        "is_stdlib": true,
        "has_include_directives": false,
        "content": ";; Standard library for funC\n;;\n\n{-\n    This file is part of…"
      },
      {
        "path": "workchain.fc",
        "content_hash": "cc1927d6dc2339075d08cada868f238ab2e1b475974e9fad9fae284732e23a7c",
        "include_in_command": true,
        "is_stdlib": false,
        "has_include_directives": true,
        "content": "#include \"stdlib.fc\";\n#include \"op-codes.fc\";\n\nconst MY_WORK…"
      }
    ]
  }
}
