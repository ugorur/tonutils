// Send mode flags of action_send_msg (block.tlb / docs.ton.org "Message modes"). Pure TS.

export const SEND_MODE_BASE = [
  { value: 0, label: 'Ordinary', hint: 'Send the value you set; fees are taken from it.' },
  { value: 64, label: 'Carry incoming value (+64)', hint: 'Add everything left from the incoming message. For contracts replying to a message.' },
  { value: 128, label: 'Carry whole balance (+128)', hint: 'Send the entire account balance. The value field is ignored.' }
] as const

export const SEND_MODE_FLAGS = [
  { value: 1, label: 'Pay fees separately (+1)', hint: 'Forward fees are paid from the balance, so the recipient gets the exact value.' },
  { value: 2, label: 'Ignore errors (+2)', hint: 'Skip this message instead of failing the whole action phase if it cannot be sent.' },
  { value: 16, label: 'Bounce on action failure (+16)', hint: 'If this action fails, bounce the transaction.' },
  { value: 32, label: 'Destroy if zero (+32)', hint: 'Delete the account if its balance becomes zero. Use with +128 only when you mean it.' }
] as const

/** "3 = pay fees separately + ignore errors". Unknown bits are listed as numbers. */
export function describeMode(mode: number): string {
  const parts: string[] = []
  let rest = mode
  for (const f of [...SEND_MODE_BASE.slice(1), ...SEND_MODE_FLAGS]) {
    if (rest & f.value) {
      parts.push(f.label.replace(/ \(\+\d+\)$/, '').toLowerCase())
      rest &= ~f.value
    }
  }
  if (rest) parts.push(`unknown bits ${rest}`)
  return `${mode} = ${parts.length ? parts.join(' + ') : 'ordinary'}`
}
