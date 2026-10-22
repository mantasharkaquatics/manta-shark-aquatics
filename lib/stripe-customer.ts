/* eslint-disable @typescript-eslint/no-explicit-any */
import type Stripe from 'stripe'

/* The family's Stripe customer (owner, 2026-10-22, tier 3: "remember this
   card"). Checkout offers a box to save the card; a saved card is offered
   at the next checkout and can be removed on My Account (/api/parent/cards).
   Card numbers never touch our database -- only the customer id
   (parents.stripe_customer_id, docs/migration-tier3.sql).

   Made the first time the family pays after this shipped. Before the
   migration (no column) it answers null and checkout goes on as before,
   with the email only. Never throws. */
export async function familyCustomer(
  stripe: Stripe, svc: any,
  parent: { id: string; email?: string | null; first_name?: string | null; last_name?: string | null },
): Promise<string | null> {
  try {
    const { data, error } = await svc.from('parents').select('stripe_customer_id').eq('id', parent.id).maybeSingle()
    if (error) return null
    if (data?.stripe_customer_id) return data.stripe_customer_id as string
    const name = `${parent.first_name || ''} ${parent.last_name || ''}`.trim()
    const c = await stripe.customers.create({
      email: parent.email || undefined, ...(name ? { name } : {}), metadata: { parent_id: parent.id },
    })
    // Claimed only if still empty: two checkouts at once keep one customer.
    const { data: won } = await svc.from('parents').update({ stripe_customer_id: c.id })
      .eq('id', parent.id).is('stripe_customer_id', null).select('id')
    if (won && won.length) return c.id
    await stripe.customers.del(c.id).catch(() => {})
    const { data: again } = await svc.from('parents').select('stripe_customer_id').eq('id', parent.id).maybeSingle()
    return (again?.stripe_customer_id as string) || null
  } catch (err) {
    console.error('[stripe-customer]', err instanceof Error ? err.message : '')
    return null
  }
}

/** The customer part of a Checkout Session: the family's customer with the
 *  "save this card" box, or (no customer) just the email, as before. */
export function checkoutCustomer(customerId: string | null, email?: string | null)
  : { customer?: string; customer_email?: string; saved_payment_method_options?: { payment_method_save: 'enabled' } } {
  return customerId
    ? { customer: customerId, saved_payment_method_options: { payment_method_save: 'enabled' as const } }
    : { customer_email: email || undefined }
}
