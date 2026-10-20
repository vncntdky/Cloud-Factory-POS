// One sale: the receipt (prints on 58/80 mm paper or A4) and, for owners and managers, Void.
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { Money } from "@/components/Money";
import { Topbar } from "@/components/Topbar";
import { PrintButton, VoidSale } from "@/components/sales/SaleTools";
import { requireActiveStaff } from "@/lib/auth";
import { paymentMethodLabel, pesos2, saleNo } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { formatManila } from "@/lib/time";

export const dynamic = "force-dynamic";

type Sale = {
  id: string;
  sale_number: number;
  business_date: string;
  status: "completed" | "voided";
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_method: string;
  tendered_cents: number | null;
  change_cents: number | null;
  reference: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  cashier: { full_name: string } | null;
  voider: { full_name: string } | null;
  sale_items: { id: string; name: string; unit_price_cents: number; quantity: number; line_total_cents: number }[];
};

export default async function SalePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile } = await requireActiveStaff();
  const [{ data }, settings, sp] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id, sale_number, business_date, status, subtotal_cents, discount_cents, total_cents, payment_method, tendered_cents, change_cents, reference, created_at, voided_at, void_reason, cashier:profiles!sales_created_by_fkey(full_name), voider:profiles!sales_voided_by_fkey(full_name), sale_items(id, name, unit_price_cents, quantity, line_total_cents)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("settings").select("business_name, address, receipt_footer").maybeSingle(),
    searchParams,
  ]);
  // Not found, or a past day a cashier can't see (RLS hides it).
  if (!data) notFound();
  const sale = data as unknown as Sale;
  const shop = settings.data as { business_name: string; address: string | null; receipt_footer: string | null } | null;
  const voided = sale.status === "voided";
  const label = `Sale ${saleNo(sale.sale_number)}`;
  const pieces = sale.sale_items.reduce((n, i) => n + i.quantity, 0);

  return (
    <>
      <Topbar title={label} backHref="/sales" backLabel="Back to sales" />
      <Main>
        <div className="stack stack-6 sale-detail">
          {voided && (
            <div className="notice notice--danger no-print" role="status">
              <Icon name="x" />
              <div>
                <p className="notice__title">Voided {sale.voided_at ? formatManila(sale.voided_at) : ""}</p>
                <p>
                  {sale.void_reason}
                  {sale.voider?.full_name ? ` · ${sale.voider.full_name}` : ""}. The stock was put back.
                </p>
              </div>
            </div>
          )}

          <article className="receipt card" aria-label="Receipt">
            <header className="receipt__head">
              <h2 className="receipt__shop">{shop?.business_name ?? "Vape POS"}</h2>
              {shop?.address && <p className="receipt__line">{shop.address}</p>}
              <p className="receipt__line">
                {label} · {formatManila(sale.created_at)}
              </p>
              {sale.cashier?.full_name && <p className="receipt__line">Cashier: {sale.cashier.full_name}</p>}
              {voided && <p className="receipt__void">VOIDED</p>}
            </header>
            <table className="receipt__items">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">
                    Qty
                  </th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {sale.sale_items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.name}
                      {i.quantity > 1 && <span className="receipt__each"> @ {pesos2(i.unit_price_cents)}</span>}
                    </td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{pesos2(i.line_total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="dl receipt__totals">
              <dt>
                Subtotal · {pieces} {pieces === 1 ? "pc" : "pcs"}
              </dt>
              <dd>{pesos2(sale.subtotal_cents)}</dd>
              {sale.discount_cents > 0 && (
                <>
                  <dt>Discount</dt>
                  <dd>−{pesos2(sale.discount_cents)}</dd>
                </>
              )}
              <dt className="dl__total">Total</dt>
              <dd className="dl__total">
                <Money cents={sale.total_cents} decimals={2} strike={voided} />
              </dd>
              <dt>{paymentMethodLabel(sale.payment_method)}</dt>
              <dd>{pesos2(sale.tendered_cents ?? sale.total_cents)}</dd>
              {sale.change_cents !== null && (
                <>
                  <dt>Change</dt>
                  <dd>{pesos2(sale.change_cents)}</dd>
                </>
              )}
              {sale.reference && (
                <>
                  <dt>Ref no.</dt>
                  <dd>{sale.reference}</dd>
                </>
              )}
            </dl>
            {shop?.receipt_footer && <p className="receipt__foot">{shop.receipt_footer}</p>}
            <p className="receipt__foot receipt__note">This is not an official receipt.</p>
          </article>

          <div className="btn-row no-print">
            <PrintButton autoPrint={sp.print === "1"} />
            {!voided && can(profile, "voidSales") && <VoidSale id={sale.id} label={label} />}
          </div>
        </div>
      </Main>
    </>
  );
}
