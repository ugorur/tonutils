// Small starter contracts (a counter, in the style of the Blueprint templates) for the playground's "Try an example".
import type { SourceFile } from '../files'

/** Initial storage for both counters: counter = 0 (uint32), as a base64 BOC. */
export const COUNTER_DATA = 'te6cckEBAQEABgAACAAAAADjAK8P'

export const tolkFiles: SourceFile[] = [{
  path: 'contracts/counter.tolk',
  content: `tolk 1.5

// Storage: one 32-bit counter
struct Storage {
    counter: uint32
}

fun Storage.load() {
    return Storage.fromCell(contract.getData())
}

fun Storage.save(self) {
    contract.setData(self.toCell())
}

// Incoming message: op 0x7e8764ef, query id, how much to add
struct (0x7e8764ef) IncreaseCounter {
    queryId: uint64
    increaseBy: uint32
}

fun onInternalMessage(in: InMessage) {
    val msg = IncreaseCounter.fromSlice(in.body);
    var storage = Storage.load();
    storage.counter += msg.increaseBy;
    storage.save();
}

get fun currentCounter(): int {
    return Storage.load().counter;
}
`
}]

export const funcFiles: SourceFile[] = [
  {
    path: 'contracts/counter.fc',
    content: `#include "imports/stdlib.fc";

;; Storage: one 32-bit counter
const op::increase = 0x7e8764ef;

int load_counter() inline {
    return get_data().begin_parse().preload_uint(32);
}

() save_counter(int counter) impure inline {
    set_data(begin_cell().store_uint(counter, 32).end_cell());
}

() recv_internal(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body) impure {
    if (in_msg_body.slice_empty?()) { ;; plain transfer: accept coins
        return ();
    }
    int op = in_msg_body~load_uint(32);
    int query_id = in_msg_body~load_uint(64);
    if (op == op::increase) {
        save_counter(load_counter() + in_msg_body~load_uint(32));
        return ();
    }
    throw(0xffff);
}

int get_counter() method_id {
    return load_counter();
}
`
  }
]
