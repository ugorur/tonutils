<script setup lang="ts">
import { describeExitCode, describeResultCode } from './exitCodes'
import MsgCard from './MsgCard.vue'
import { balanceChange, feeBreakdown, SKIP_REASON, STATUS_LABEL, txOutcome, type TxView } from './txview'

// Full breakdown of one transaction: overview, every phase, fees and messages. Client-only (AddressLink).
const props = defineProps<{
  tx: TxView
  /** Wallet version of the account (adds wallet-specific exit code meanings). */
  walletVersion?: string | null
  /** Emulated: no explorer links (the hash does not exist on chain). */
  emulated?: boolean
}>()

interface Row { label: string, value?: string, coin?: bigint, hint?: string, tone?: 'error' | 'success' }
interface Phase { title: string, icon: string, ok: boolean | null, rows: Row[] }

const outcome = computed(() => txOutcome(props.tx))
const fees = computed(() => feeBreakdown(props.tx))
const delta = computed(() => balanceChange(props.tx))
const time = computed(() => new Date(props.tx.now * 1000).toLocaleString())

const phases = computed<Phase[]>(() => {
  const t = props.tx
  const out: Phase[] = []
  const storage: Phase | null = t.storage && {
    title: 'Storage phase',
    icon: 'i-lucide-hard-drive',
    ok: null,
    rows: [
      { label: 'Storage fees collected', coin: t.storage.fees },
      ...(t.storage.due ? [{ label: 'Storage fees still due (debt)', coin: t.storage.due }] : []),
      { label: 'Status change', value: t.storage.statusChange }
    ]
  }
  const credit: Phase | null = t.credit && {
    title: 'Credit phase',
    icon: 'i-lucide-arrow-down-to-line',
    ok: null,
    rows: [
      { label: 'Credited to the account', coin: t.credit.credit },
      ...(t.credit.dueCollected ? [{ label: 'Storage debt repaid', coin: t.credit.dueCollected }] : [])
    ]
  }
  if (t.creditFirst) out.push(...[credit, storage].filter((p): p is Phase => !!p))
  else out.push(...[storage, credit].filter((p): p is Phase => !!p))

  const c = t.compute
  if (c) {
    out.push(c.skipped
      ? { title: 'Compute phase', icon: 'i-lucide-cpu', ok: false, rows: [{ label: 'Skipped', value: c.reason, hint: SKIP_REASON[c.reason], tone: 'error' }] }
      : {
          title: 'Compute phase',
          icon: 'i-lucide-cpu',
          ok: c.success,
          rows: [
            { label: 'Exit code', value: String(c.exitCode), hint: describeExitCode(c.exitCode, props.walletVersion), tone: c.success ? 'success' : 'error' },
            ...(c.exitArg !== null ? [{ label: 'Exit argument', value: String(c.exitArg) }] : []),
            { label: 'Gas used', value: c.gasLimit ? `${c.gasUsed.toLocaleString()} of ${c.gasLimit.toLocaleString()} limit` : c.gasUsed.toLocaleString(), hint: c.gasCredit ? `Gas credit ${c.gasCredit.toLocaleString()} (external message: the contract must ACCEPT before the credit runs out)` : undefined },
            { label: 'Gas fee', coin: c.gasFees },
            { label: 'VM steps', value: c.vmSteps.toLocaleString() },
            ...(c.accountActivated ? [{ label: 'Account activated', value: 'yes (deployed by this message)' }] : [])
          ]
        })
  }

  const a = t.action
  if (a) {
    out.push({
      title: 'Action phase',
      icon: 'i-lucide-send',
      ok: a.success,
      rows: [
        { label: 'Result code', value: String(a.resultCode), hint: describeResultCode(a.resultCode), tone: a.success ? 'success' : 'error' },
        ...(a.resultArg !== null ? [{ label: 'Failed action index', value: String(a.resultArg) }] : []),
        { label: 'Actions', value: `${a.totalActions} total · ${a.msgsCreated} messages created · ${a.skippedActions} skipped${a.specActions ? ` · ${a.specActions} special` : ''}` },
        { label: 'Action fees (kept by validators)', coin: a.totalActionFees },
        { label: 'Forwarding fees, total', coin: a.totalFwdFees },
        ...(a.noFunds ? [{ label: 'No funds', value: 'yes: not enough balance to perform the actions', tone: 'error' as const }] : []),
        ...(a.statusChange !== 'unchanged' ? [{ label: 'Status change', value: a.statusChange }] : [])
      ]
    })
  }

  const b = t.bounce
  if (b) {
    out.push({
      title: 'Bounce phase',
      icon: 'i-lucide-undo-2',
      ok: b.type === 'ok',
      rows: b.type === 'ok'
        ? [{ label: 'Result', value: 'Value returned to the sender in a bounced message' }, { label: 'Bounce message fee', coin: b.msgFees }, { label: 'Bounce forward fee', coin: b.fwdFees }]
        : b.type === 'nofunds'
          ? [{ label: 'Result', value: 'Not enough value left to bounce', tone: 'error' }, { label: 'Forward fee required', coin: b.reqFwdFees }]
          : [{ label: 'Result', value: 'Negative funds: nothing to bounce', tone: 'error' }]
    })
  }
  return out
})

const feeRows = computed<Row[]>(() => {
  const f = fees.value
  return [
    { label: 'Storage', coin: f.storage },
    { label: 'Gas (computation)', coin: f.gas },
    { label: 'Sending messages (action fees)', coin: f.action },
    ...(f.bounce ? [{ label: 'Bounce', coin: f.bounce }] : []),
    ...(f.other ? [{ label: 'Inbound external message import', coin: f.other }] : []),
    { label: 'Total fees', coin: f.total },
    ...(f.outForward ? [{ label: 'Plus forwarding fees carried by outgoing messages', coin: f.outForward, hint: 'Paid from the balance, not part of total fees' }] : [])
  ]
})
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center gap-2">
      <UBadge :color="outcome.ok ? 'success' : 'error'" variant="subtle" :icon="outcome.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" :label="outcome.label" />
      <UBadge color="neutral" variant="outline" :label="`Type: ${tx.type}`" />
      <UBadge v-if="tx.aborted" color="warning" variant="subtle" label="Aborted: state changes rolled back" />
      <UBadge v-if="tx.destroyed" color="warning" variant="subtle" label="Account destroyed" />
      <UBadge v-if="emulated" color="primary" variant="subtle" icon="i-lucide-flask-conical" label="Emulated" />
    </div>

    <div class="divide-y divide-default">
      <ResultField :label="emulated ? 'Transaction hash (emulated)' : 'Transaction hash'" :value="tx.hashHex">
        <span class="break-all">{{ tx.hashHex }}</span>
        <span class="mt-0.5 block text-xs break-all text-dimmed">{{ tx.hash }}</span>
        <ExplorerLinks v-if="!emulated" kind="tx" :value="tx.hashHex" class="mt-1" />
      </ResultField>
      <ResultField label="Account" :value="tx.account" :copy="false">
        <AddressLink :address="tx.account" />
      </ResultField>
      <div class="grid gap-x-6 sm:grid-cols-2">
        <ResultField label="Time" :value="time" :mono="false" :copy="false" />
        <ResultField label="Logical time (lt)" :value="tx.lt.toString()" :hint="tx.prevLt ? `Previous transaction lt ${tx.prevLt}` : 'First transaction of this account'" />
        <ResultField label="Account status" :value="`${STATUS_LABEL[tx.origStatus]} → ${STATUS_LABEL[tx.endStatus]}`" :mono="false" :copy="false" />
        <ResultField label="Balance change" :value="delta.toString()" :copy="false" :hint="tx.balanceBefore === null ? 'Computed: credit − fees − outgoing value and forwarding fees' : undefined">
          <TokenAmount :nano="delta" :class="delta < 0n ? 'text-error' : 'text-success'" />
        </ResultField>
      </div>
    </div>

    <section aria-label="Phases">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Phases
      </h3>
      <div class="mt-2 grid gap-3 lg:grid-cols-2">
        <div v-for="p in phases" :key="p.title" class="rounded-lg border border-default p-3 sm:p-4" :data-testid="`phase-${p.title.split(' ')[0]!.toLowerCase()}`">
          <div class="flex items-center gap-2">
            <UIcon :name="p.icon" class="size-4 text-muted" />
            <span class="text-sm font-medium text-highlighted">{{ p.title }}</span>
            <UIcon v-if="p.ok === true" name="i-lucide-circle-check" class="size-4 text-success" />
            <UIcon v-else-if="p.ok === false" name="i-lucide-circle-x" class="size-4 text-error" />
          </div>
          <dl class="mt-2 space-y-1.5 text-sm">
            <div v-for="r in p.rows" :key="r.label">
              <dt class="text-xs text-muted">
                {{ r.label }}
              </dt>
              <dd class="font-mono break-words" :class="r.tone === 'error' ? 'text-error' : r.tone === 'success' ? 'text-success' : 'text-highlighted'">
                <TokenAmount v-if="r.coin !== undefined" :nano="r.coin" />
                <template v-else>
                  {{ r.value }}
                </template>
              </dd>
              <dd v-if="r.hint" class="text-xs text-dimmed">
                {{ r.hint }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section aria-label="Fees">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Fees
      </h3>
      <dl class="mt-2 divide-y divide-default rounded-lg border border-default px-3 text-sm">
        <div v-for="r in feeRows" :key="r.label" class="flex flex-wrap items-baseline justify-between gap-x-4 py-2" :class="r.label === 'Total fees' && 'font-semibold'">
          <dt class="text-muted">
            {{ r.label }}
            <span v-if="r.hint" class="block text-xs text-dimmed">{{ r.hint }}</span>
          </dt>
          <dd class="font-mono text-highlighted">
            <TokenAmount :nano="r.coin!" />
          </dd>
        </div>
      </dl>
    </section>

    <section aria-label="Messages" class="space-y-3">
      <h3 class="font-display text-sm font-semibold text-highlighted">
        Messages
      </h3>
      <MsgCard v-if="tx.inMsg" :msg="tx.inMsg" title="Inbound message" />
      <p v-else class="text-sm text-muted">
        No inbound message ({{ tx.type === 'tick' || tx.type === 'tock' ? 'tick-tock transaction run by validators' : 'system transaction' }}).
      </p>
      <MsgCard v-for="(m, i) in tx.outMsgs" :key="i" :msg="m" :title="`Outgoing message ${i + 1} of ${tx.outMsgs.length}`" />
      <p v-if="!tx.outMsgs.length" class="text-sm text-muted">
        No outgoing messages.
      </p>
    </section>
  </div>
</template>
