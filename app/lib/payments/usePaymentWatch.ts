// Polls tonapi account events for an invoice's payment. One request per poll (keyless tonapi allows ~1 req/s
// per IP, shared by the whole site), paused while the tab is hidden, stopped once the invoice is settled.
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useTonapi } from '~/composables/useTonapi'
import type { InvoiceSpec, InvoiceState, TonapiEvent } from './match'
import { findPayments, invoiceState, mergeEvents } from './match'

/** Pages of 100 events read on the first scan (busy accounts); later polls read the newest page. */
const FIRST_SCAN_PAGES = 5
const POLL_MS = 10_000

export function usePaymentWatch(spec: () => InvoiceSpec | null, opts: { active?: () => boolean } = {}) {
  const tonapi = useTonapi()
  const events = shallowRef<TonapiEvent[]>([])
  const error = ref<unknown>(null)
  const checking = ref(false)
  const lastChecked = ref<number | null>(null)
  const scanned = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let session = 0

  const state = computed<InvoiceState>(() => {
    const s = spec()
    return s ? invoiceState(findPayments(events.value, s), s.amount) : invoiceState([])
  })
  const settled = computed(() => state.value.status === 'paid' || state.value.status === 'overpaid')

  async function page(s: InvoiceSpec, limit: number, beforeLt?: number) {
    return tonapi.get<{ events: TonapiEvent[], next_from?: number }>(`accounts/${encodeURIComponent(s.to)}/events`, {
      limit,
      start_date: s.since,
      before_lt: beforeLt
    })
  }

  async function check() {
    const s = spec()
    if (!s) return
    const my = session
    clearTimeout(timer)
    checking.value = true
    error.value = null
    try {
      if (!scanned.value) {
        let before: number | undefined
        for (let i = 0; i < FIRST_SCAN_PAGES; i++) {
          const r = await page(s, 100, before)
          if (my !== session) return
          events.value = mergeEvents(events.value, r.events)
          if (r.events.length < 100 || !r.next_from) break
          before = r.next_from
        }
        scanned.value = true
      }
      else {
        const r = await page(s, 25)
        if (my !== session) return
        events.value = mergeEvents(events.value, r.events)
      }
      lastChecked.value = Date.now()
    }
    catch (e) {
      if (my === session) error.value = e
    }
    finally {
      if (my === session) {
        checking.value = false
        schedule()
      }
    }
  }

  function schedule() {
    clearTimeout(timer)
    if (settled.value || !spec() || (opts.active && !opts.active())) return
    // After an error (rate limit, network) keep watching, just slower: a watcher left open must not die silently.
    timer = setTimeout(() => {
      if (document.hidden) schedule()
      else void check()
    }, error.value ? POLL_MS * 3 : POLL_MS)
  }

  watch(() => JSON.stringify(spec(), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), () => {
    session++
    clearTimeout(timer)
    events.value = []
    scanned.value = false
    lastChecked.value = null
    error.value = null
    checking.value = false
    if (spec()) void check()
  }, { immediate: true })
  onBeforeUnmount(() => {
    session++
    clearTimeout(timer)
  })

  return { state, settled, events, error, checking, lastChecked, check }
}
