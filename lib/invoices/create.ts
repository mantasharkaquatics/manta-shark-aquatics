// Every invoice in the system is numbered here, and nowhere else.
//
// The number comes from a database sequence and lands in a column with a unique
// index on it. Six call sites each did their own version of:
//
//   const { data: seqNum } = await svc.rpc('get_next_invoice_seq')
//   const invoice_number = `MSA-${year}-${String(seqNum || 1).padStart(4, '0')}`
//
// and that `|| 1` is the whole problem. When the sequence call failed for any
// reason, the fallback was not a safe default -- it was a number that had
// already been used years ago, guaranteeing a unique-index violation. The
// insert then failed, and at most call sites the error was never read: the
// family's money was banked, their points were in the wallet, and no receipt
// existed anywhere. For a business that takes payment up front, a missing
// receipt is not a cosmetic problem.
//
// So: no fallback number, ever. If the sequence cannot be read, that is an
// error and the caller hears about it. And because two payments taken in the
// same second can still race for the same number, a collision is retried with a
// fresh one rather than thrown away.

type Svc = any

export class InvoiceNumberUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvoiceNumberUnavailable'
  }
}

const MAX_ATTEMPTS = 4

/**
 * Insert an invoice, assigning its number. Pass everything BUT
 * `invoice_number` -- that is this function's job.
 *
 * Returns the created row. Throws rather than returning a half-made invoice:
 * callers that must not fail because of a receipt should catch and log, which
 * is what the payment paths do.
 */
export async function insertInvoice(
  svc: Svc,
  row: Record<string, unknown>,
  select = '*',
): Promise<any> {
  let last = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: seqNum, error: seqErr } = await svc.rpc('get_next_invoice_seq')
    const n = Number(seqNum)
    if (seqErr || !Number.isFinite(n) || n <= 0) {
      // Deliberately not falling back to a number. A wrong number is worse than
      // no number: it collides, the insert dies, and the receipt is lost
      // silently. Better to say the sequence is broken.
      throw new InvoiceNumberUnavailable(
        `Could not get the next invoice number: ${seqErr?.message ?? `sequence returned ${JSON.stringify(seqNum)}`}`,
      )
    }

    const invoice_number = `MSA-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`
    const { data, error } = await svc
      .from('invoices')
      .insert({ ...row, invoice_number })
      .select(select)
      .single()

    if (!error) return data

    // Someone else took this number between our reading it and our writing it.
    // Take the next one.
    if ((error as any).code === '23505') {
      last = `invoice number ${invoice_number} was already taken`
      continue
    }
    throw new Error(`Could not create the invoice: ${error.message}`)
  }
  throw new InvoiceNumberUnavailable(`Could not find a free invoice number after ${MAX_ATTEMPTS} tries (${last})`)
}
