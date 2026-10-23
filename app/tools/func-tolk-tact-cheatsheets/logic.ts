// FunC / Tolk / Tact side-by-side cheat sheets.
// Sources (read 2026-10-23): docs.ton.org Tolk pages (tolk-vs-func, stdlib-comparison, message handling/sending, storage,
// getters), Tolk 1.5 stdlib common.tolk (@ton/tolk-js 1.5.0), FunC stdlib.fc (ton-blockchain/ton), docs.tact-lang.org.
// Every Tolk and FunC example below is compiled in logic.test.ts; Tact examples are not (its compiler is deprecated).

export type Lang = 'func' | 'tolk' | 'tact'

export const LANGS: { id: Lang, name: string, note: string }[] = [
  { id: 'tolk', name: 'Tolk', note: 'The current official language (compiler 1.5).' },
  { id: 'func', name: 'FunC', note: 'Legacy; the compiler is no longer maintained.' },
  { id: 'tact', name: 'Tact', note: 'Deprecated in favour of Tolk; existing contracts still run.' }
]

export interface Row {
  label: string
  func?: string
  tolk?: string
  tact?: string
}

export interface Topic {
  id: string
  title: string
  intro: string
  rows?: Row[]
  /** Full examples. Tolk/FunC ones must compile on their own (the test adds a stdlib and an empty handler). */
  example?: Partial<Record<Lang, string>>
}

export const TOPICS: Topic[] = [
  {
    id: 'handlers',
    title: 'Handle incoming messages',
    intro: 'Route by the 32-bit op code at the start of the body. Empty bodies are plain transfers; unknown ops throw 0xFFFF by convention.',
    example: {
      tolk: `struct (0x12345678) Increment {
    queryId: uint64
    by: uint32
}

struct (0x23456789) Reset {
    queryId: uint64
}

type AllowedMessage = Increment | Reset

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);
    match (msg) {
        Increment => {
            // msg.by, in.senderAddress, in.valueCoins
        }
        Reset => {
        }
        else => {
            if (in.body.isEmpty()) {
                return;   // plain transfer: accept coins
            }
            throw 0xFFFF;
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    // our outgoing message bounced back
}`,
      func: `#include "imports/stdlib.fc";

() recv_internal(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body) impure {
    if (in_msg_body.slice_empty?()) {
        return ();                      ;; plain transfer
    }
    slice cs = in_msg_full.begin_parse();
    int flags = cs~load_uint(4);
    if (flags & 1) {
        return ();                      ;; bounced message
    }
    slice sender = cs~load_msg_addr();

    int op = in_msg_body~load_uint(32);
    int query_id = in_msg_body~load_uint(64);
    if (op == 0x12345678) {
        int by = in_msg_body~load_uint(32);
        return ();
    }
    throw(0xffff);
}`,
      tact: `message(0x12345678) Increment {
    queryId: Int as uint64;
    by: Int as uint32;
}

contract Counter {
    counter: Int as uint32 = 0;

    receive(msg: Increment) {
        self.counter += msg.by;
    }

    receive("reset") {          // text comment
        self.counter = 0;
    }

    receive() {}                // empty body (plain transfer)

    bounced(msg: bounced<Increment>) {}
}`
    }
  },
  {
    id: 'types',
    title: 'Types',
    intro: 'All integers are 257-bit TVM integers at runtime; the width only matters when (de)serializing.',
    rows: [
      { label: 'Integer', func: 'int', tolk: 'int, int32, uint64, int256…', tact: 'Int, Int as uint64' },
      { label: 'Coin amount', func: 'int (store_coins)', tolk: 'coins', tact: 'Int as coins' },
      { label: 'Boolean', func: 'int (-1 true, 0 false)', tolk: 'bool', tact: 'Bool' },
      { label: 'Address', func: 'slice', tolk: 'address', tact: 'Address' },
      { label: 'Cell / slice / builder', func: 'cell, slice, builder', tolk: 'cell, slice, builder, Cell<T>', tact: 'Cell, Slice, Builder' },
      { label: 'Dictionary', func: 'cell + udict_* functions', tolk: 'map<K, V>', tact: 'map<K, V>' },
      { label: 'Nullable', func: 'any value may be null', tolk: 'T?', tact: 'T?' },
      { label: 'Record', func: 'tensor (int, slice, int)', tolk: 'struct', tact: 'struct / message' },
      { label: 'String', func: 'slice literal "abc"', tolk: 'string / slice', tact: 'String' }
    ]
  },
  {
    id: 'build',
    title: 'Build a cell',
    intro: 'A cell holds up to 1023 bits and 4 references. Tolk can serialize a struct for you.',
    example: {
      tolk: `struct (0x0f8a7ea5) Transfer {
    queryId: uint64
    amount: coins
    destination: address
}

fun buildManually(queryId: int, amount: coins, to: address): cell {
    return beginCell()
        .storeUint(0x0f8a7ea5, 32)
        .storeUint(queryId, 64)
        .storeCoins(amount)
        .storeAddress(to)
        .endCell();
}

fun buildAuto(queryId: uint64, amount: coins, to: address): cell {
    val body: Transfer = { queryId, amount, destination: to };
    return body.toCell();
}`,
      func: `cell build_transfer(int query_id, int amount, slice to) inline {
    return begin_cell()
        .store_uint(0x0f8a7ea5, 32)
        .store_uint(query_id, 64)
        .store_coins(amount)
        .store_slice(to)
        .end_cell();
}`,
      tact: `let c: Cell = beginCell()
    .storeUint(0x0f8a7ea5, 32)
    .storeUint(queryId, 64)
    .storeCoins(amount)
    .storeAddress(to)
    .endCell();

// or with a message struct:
let c2: Cell = Transfer{ queryId, amount, destination: to }.toCell();`
    }
  },
  {
    id: 'parse',
    title: 'Parse a cell',
    intro: 'Read fields in the order they were written. Reading past the end throws exit code 9 (cell underflow).',
    example: {
      tolk: `struct (0x0f8a7ea5) Transfer {
    queryId: uint64
    amount: coins
    destination: address
}

fun parseManually(c: cell) {
    var s = c.beginParse();
    val op = s.loadUint(32);
    val queryId = s.loadUint(64);
    val amount = s.loadCoins();
    val to = s.loadAddress();
    return (op, queryId, amount, to);
}

fun parseAuto(c: cell): Transfer {
    return Transfer.fromCell(c);    // checks the op code (exit 63 on mismatch)
}`,
      func: `(int, int, int, slice) parse_transfer(cell c) inline {
    slice s = c.begin_parse();
    int op = s~load_uint(32);
    int query_id = s~load_uint(64);
    int amount = s~load_coins();
    slice to = s~load_msg_addr();
    return (op, query_id, amount, to);
}`,
      tact: `let s: Slice = c.beginParse();
let op: Int = s.loadUint(32);
let queryId: Int = s.loadUint(64);
let amount: Int = s.loadCoins();
let to: Address = s.loadAddress();

// or:
let t: Transfer = Transfer.fromCell(c);`
    }
  },
  {
    id: 'storage',
    title: 'Contract storage',
    intro: 'Persistent data lives in register c4. Tact stores contract fields automatically.',
    example: {
      tolk: `struct Storage {
    counter: uint64
    owner: address
}

fun Storage.load() {
    return Storage.fromCell(contract.getData());
}

fun Storage.save(self) {
    contract.setData(self.toCell());
}

fun increment() {
    var st = lazy Storage.load();
    st.counter += 1;
    st.save();
}`,
      func: `(int, slice) load_data() inline {
    slice ds = get_data().begin_parse();
    return (ds~load_uint(64), ds~load_msg_addr());
}

() save_data(int counter, slice owner) impure inline {
    set_data(begin_cell().store_uint(counter, 64).store_slice(owner).end_cell());
}

() increment() impure {
    var (counter, owner) = load_data();
    save_data(counter + 1, owner);
}`,
      tact: `contract Counter {
    counter: Int as uint64;
    owner: Address;

    init(owner: Address) {
        self.counter = 0;
        self.owner = owner;
    }

    receive("increment") {
        self.counter += 1;      // saved automatically
    }
}`
    }
  },
  {
    id: 'send',
    title: 'Send a message',
    intro: 'Bounceable (0x18) for contracts, non-bounceable (0x10) for plain transfers to wallets. The send mode decides who pays fees.',
    example: {
      tolk: `struct (0x00000000) TextComment {
    text: RemainingBitsAndRefs
}

fun sendCoins(to: address, amount: coins) {
    val msg = createMessage({
        bounce: BounceMode.NoBounce,
        value: amount,
        dest: to,
    });
    msg.send(SEND_MODE_PAY_FEES_SEPARATELY);
}

fun replyWithRemainingValue(to: address) {
    val reply = createMessage({
        bounce: BounceMode.NoBounce,
        value: 0,
        dest: to,
        body: TextComment { text: "thanks".literalSlice() },
    });
    reply.send(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
}`,
      func: `() send_coins(slice to, int amount) impure inline {
    cell msg = begin_cell()
        .store_uint(0x10, 6)            ;; non-bounceable; 0x18 = bounceable
        .store_slice(to)
        .store_coins(amount)
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(0, 32)              ;; text comment op
        .store_slice("thanks")
        .end_cell();
    send_raw_message(msg, 1);           ;; 1 = pay fees separately
}`,
      tact: `send(SendParameters{
    to: to,
    value: amount,
    bounce: false,
    mode: SendPayFwdFeesSeparately,
    body: "thanks".asComment(),
});

// reply to the sender with the remaining value (mode 64 + 2):
self.reply("thanks".asComment());`
    }
  },
  {
    id: 'getters',
    title: 'Get-methods',
    intro: 'Read-only functions called off-chain (toncenter runGetMethod, tonapi). They cost no fees.',
    example: {
      tolk: `struct Storage {
    counter: uint64
    owner: address
}

get fun counter(): int {
    val st = lazy Storage.fromCell(contract.getData());
    return st.counter;
}

get fun owner(): address {
    val st = lazy Storage.fromCell(contract.getData());
    return st.owner;
}`,
      func: `int counter() method_id {
    return get_data().begin_parse().preload_uint(64);
}

slice owner() method_id {
    slice ds = get_data().begin_parse();
    ds~load_uint(64);
    return ds~load_msg_addr();
}`,
      tact: `get fun counter(): Int {
    return self.counter;
}

get fun owner(): Address {
    return self.owner;
}`
    }
  },
  {
    id: 'errors',
    title: 'Errors',
    intro: 'Codes 0–127 are reserved for TVM, Tact uses 128–255; use 256–65535 for your own errors.',
    example: {
      tolk: `const ERR_NOT_OWNER = 401
const ERR_NEGATIVE = 402

fun check(sender: address, owner: address, amount: int) {
    assert (amount >= 0) throw ERR_NEGATIVE;
    assert (sender == owner) throw ERR_NOT_OWNER;
}

fun safe(): int {
    try {
        throw 500;
    } catch (code) {
        return code;
    }
}`,
      func: `const int error::not_owner = 401;
const int error::negative = 402;

() check(slice sender, slice owner, int amount) impure inline {
    throw_if(error::negative, amount < 0);
    throw_unless(error::not_owner, equal_slice_bits(sender, owner));
}

int safe() {
    try {
        throw(500);
    } catch (_, code) {
        return code;
    }
    return 0;
}`,
      tact: `throwIf(402, amount < 0);
throwUnless(401, sender() == self.owner);
require(amount >= 0, "Negative amount");  // code derived from the message

try {
    throw(500);
} catch (code) {
    // code == 500
}`
    }
  },
  {
    id: 'stdlib',
    title: 'Everyday functions',
    intro: 'The same building blocks under three names.',
    rows: [
      { label: 'Current unix time', func: 'now()', tolk: 'blockchain.now()', tact: 'now()' },
      { label: 'Own address', func: 'my_address()', tolk: 'contract.getAddress()', tact: 'myAddress()' },
      { label: 'Balance', func: 'get_balance().pair_first()', tolk: 'contract.getOriginalBalance()', tact: 'myBalance()' },
      { label: 'Sender', func: 'parse in_msg_full (load_msg_addr)', tolk: 'in.senderAddress', tact: 'sender()' },
      { label: 'Attached value', func: 'msg_value argument', tolk: 'in.valueCoins', tact: 'context().value' },
      { label: 'Accept external message', func: 'accept_message()', tolk: 'acceptExternalMessage()', tact: 'acceptMessage()' },
      { label: 'Check signature', func: 'check_signature(hash, sig, key)', tolk: 'isSignatureValid(hash, sig, key)', tact: 'checkSignature(hash, sig, key)' },
      { label: 'Cell hash', func: 'cell_hash(c)', tolk: 'c.hash()', tact: 'c.hash()' },
      { label: 'Reserve coins', func: 'raw_reserve(amount, mode)', tolk: 'reserveGramsOnBalance(amount, mode)', tact: 'nativeReserve(amount, mode)' },
      { label: 'Random number < n', func: 'rand(n)', tolk: 'random.range(n)', tact: 'random(0, n)' },
      { label: 'Debug print', func: '~dump(x)', tolk: 'debug.print(x)', tact: 'dump(x)' },
      { label: 'Crash on purpose', func: 'throw(code)', tolk: 'throw code', tact: 'throw(code)' }
    ]
  }
]

export interface ModeRow {
  value: number
  tolk: string
  tact: string
  /** @ton/core enum member, when it exists */
  core?: string
  meaning: string
}

export const SEND_MODES: ModeRow[] = [
  { value: 0, tolk: 'SEND_MODE_REGULAR', tact: 'SendDefaultMode', core: 'NONE', meaning: 'Ordinary message; fees are deducted from the value.' },
  { value: 1, tolk: 'SEND_MODE_PAY_FEES_SEPARATELY', tact: 'SendPayFwdFeesSeparately', core: 'PAY_GAS_SEPARATELY', meaning: '+1: pay forward fees from the contract balance, not from the value.' },
  { value: 2, tolk: 'SEND_MODE_IGNORE_ERRORS', tact: 'SendIgnoreErrors', core: 'IGNORE_ERRORS', meaning: '+2: skip this message if it fails in the action phase.' },
  { value: 16, tolk: 'SEND_MODE_BOUNCE_ON_ACTION_FAIL', tact: 'SendBounceIfActionFail', meaning: '+16: bounce the whole transaction if the action fails. No effect with +2.' },
  { value: 32, tolk: 'SEND_MODE_DESTROY', tact: 'SendDestroyIfZero', core: 'DESTROY_ACCOUNT_IF_ZERO', meaning: '+32: destroy the account if its balance becomes zero (use with 128).' },
  { value: 64, tolk: 'SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE', tact: 'SendRemainingValue', core: 'CARRY_ALL_REMAINING_INCOMING_VALUE', meaning: 'Carry the remaining value of the incoming message plus the stated value.' },
  { value: 128, tolk: 'SEND_MODE_CARRY_ALL_BALANCE', tact: 'SendRemainingBalance', core: 'CARRY_ALL_REMAINING_BALANCE', meaning: 'Carry the whole remaining balance of the contract.' },
  { value: 1024, tolk: 'SEND_MODE_ESTIMATE_FEE_ONLY', tact: 'SendOnlyEstimateFee', meaning: 'Do not send; only estimate the fee.' }
]

export const RESERVE_MODES: ModeRow[] = [
  { value: 0, tolk: 'RESERVE_MODE_EXACT_AMOUNT', tact: 'ReserveExact', core: 'THIS_AMOUNT', meaning: 'Reserve exactly this amount; fail if the balance is lower.' },
  { value: 1, tolk: 'RESERVE_MODE_ALL_BUT_AMOUNT', tact: 'ReserveAllExcept', core: 'LEAVE_THIS_AMOUNT', meaning: '+1: reserve everything except this amount.' },
  { value: 2, tolk: 'RESERVE_MODE_AT_MOST', tact: 'ReserveAtMost', core: 'AT_MOST_THIS_AMOUNT', meaning: '+2: reserve min(amount, balance) instead of failing.' },
  { value: 4, tolk: 'RESERVE_MODE_INCREASE_BY_ORIGINAL_BALANCE', tact: 'ReserveAddOriginalBalance', core: 'BEFORE_BALANCE_PLUS_THIS_AMOUNT', meaning: '+4: add the balance from before the compute phase.' },
  { value: 8, tolk: 'RESERVE_MODE_NEGATE_AMOUNT', tact: 'ReserveInvertSign', meaning: '+8: negate the amount first (use with +4: original balance minus amount).' },
  { value: 16, tolk: 'RESERVE_MODE_BOUNCE_ON_ACTION_FAIL', tact: 'ReserveBounceIfActionFail', meaning: '+16: bounce the transaction if the reservation fails.' }
]

/** FunC stdlib → Tolk, a selection from docs.ton.org "Standard libraries comparison". */
export const STDLIB_MAP: [func: string, tolk: string][] = [
  ['begin_cell / end_cell', 'beginCell / endCell'],
  ['begin_parse', 'beginParse'],
  ['s~load_uint(32)', 's.loadUint(32)'],
  ['b.store_uint(x, 32)', 'b.storeUint(x, 32)'],
  ['load_msg_addr / store_slice(addr)', 'loadAddress / storeAddress'],
  ['now', 'blockchain.now'],
  ['my_address', 'contract.getAddress'],
  ['get_balance + pair_first', 'contract.getOriginalBalance'],
  ['cur_lt', 'blockchain.logicalTime'],
  ['get_data / set_data', 'contract.getData / contract.setData'],
  ['accept_message', 'acceptExternalMessage'],
  ['set_gas_limit', 'setGasLimit'],
  ['commit', 'commitContractDataAndActions'],
  ['check_signature', 'isSignatureValid'],
  ['check_data_signature', 'isSliceSignatureValid'],
  ['cell_hash(c) / slice_hash(s)', 'c.hash() / s.hash()'],
  ['string_hash(s)', 's.bitsHash()'],
  ['slice_empty?(s)', 's.isEmpty()'],
  ['slice_bits(s) / slice_refs(s)', 's.remainingBitsCount() / s.remainingRefsCount()'],
  ['end_parse(s)', 's.assertEnd()'],
  ['equal_slice_bits(a, b)', 'a.bitsEqual(b)'],
  ['muldiv / muldivr / muldivc', 'mulDivFloor / mulDivRound / mulDivCeil'],
  ['raw_reserve', 'reserveGramsOnBalance'],
  ['send_raw_message', 'createMessage(…).send(mode)'],
  ['set_code', 'contract.setCodePostponed'],
  ['config_param', 'blockchain.configParam'],
  ['random / rand', 'random.uint256 / random.range'],
  ['new_dict + udict_set', 'map<K, V> [] + m.set(k, v)'],
  ['~dump / ~strdump', 'debug.print / debug.printString']
]

/** FunC string literal suffixes → Tolk compile-time methods (docs.ton.org "Tolk vs FunC"). */
export const STRING_POSTFIXES: [func: string, tolk: string, meaning: string][] = [
  ['"..."c', '"...".crc32()', 'CRC32 as an integer (op codes)'],
  ['"..."H', '"...".sha256()', 'SHA-256 as a 256-bit integer'],
  ['"..."h', '"...".sha256_32()', 'First 32 bits of SHA-256'],
  ['"..."s', '"...".hexToSlice()', 'Hex string to slice'],
  ['"..."u', '"...".toBase256()', 'ASCII to an integer'],
  ['"..."a', 'address("...")', 'Address constant']
]

/** Free-text filter over topics and table rows. */
export function filterTopics(query: string): Topic[] {
  const q = query.trim().toLowerCase()
  if (!q) return TOPICS
  return TOPICS.filter(t => [t.title, t.intro, ...(t.rows ?? []).flatMap(r => [r.label, r.func, r.tolk, r.tact]), ...Object.values(t.example ?? {})]
    .join(' ').toLowerCase().includes(q))
}
