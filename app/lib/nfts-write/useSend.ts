// Send one TonConnect request, wait for its trace and summarise failures. Shared by the nfts-write wallet tools.
import { ref, shallowRef } from 'vue'
import { type TonConnectMessage, type TonTrace, useTonConnect } from '~/composables/useTonConnect'

export interface SendOutcome {
  hash: string
  trace: TonTrace | null
  /** Transactions in the trace whose compute phase failed or that were aborted (bounces, rejections). */
  failed: { account: string, exitCode?: number }[]
}

/** Transactions of a trace that aborted or whose compute phase failed (any account, the wallet included). */
export function traceFailures(trace: TonTrace | null): SendOutcome['failed'] {
  if (!trace) return []
  return Object.values(trace.transactions)
    .filter(t => t.description?.aborted || t.description?.compute_ph?.success === false)
    .map(t => ({ account: t.account, exitCode: t.description?.compute_ph?.exit_code }))
}

export function useSend() {
  const tc = useTonConnect()
  const sending = ref(false)
  const stage = ref('')
  const error = ref<unknown>(null)
  const last = shallowRef<SendOutcome | null>(null)

  async function send(messages: TonConnectMessage[]): Promise<SendOutcome | null> {
    sending.value = true
    error.value = null
    last.value = null
    try {
      stage.value = 'Confirm in your wallet…'
      const r = await tc.sendTransaction({ messages })
      last.value = { hash: r.hash, trace: null, failed: [] }
      stage.value = 'Sent. Waiting for the network (usually 5–15 s)…'
      let trace: TonTrace | null = null
      try {
        trace = await tc.waitForTransaction(r.hash)
      }
      catch { /* timed out: the hash is still shown with explorer links */ }
      last.value = { hash: r.hash, trace, failed: traceFailures(trace) }
      return last.value
    }
    catch (e) {
      error.value = e
      return null
    }
    finally {
      sending.value = false
      stage.value = ''
    }
  }

  return { send, sending, stage, error, last }
}
