// Import products from a CSV file (owners and managers): download the template, fill it in, upload it,
// check each row, add. The rules live in the database (import_products); see lib/csv.ts for the columns.
import { Icon } from "@/components/Icon";
import { Main } from "@/components/Main";
import { NotAllowed } from "@/components/NotAllowed";
import { Topbar } from "@/components/Topbar";
import { ImportProducts } from "@/components/inventory/ImportProducts";
import { requireActiveStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** The template file in public/templates, its columns and what each takes. */
const TEMPLATE_HREF = "/templates/products-template.csv";

const COLUMNS: { name: string; what: string }[] = [
  { name: "Product", what: "Needed. The name as it is in the app, usually the flavour, e.g. Mango or Very Chill." },
  { name: "Selling price", what: "Needed. Pesos, e.g. 340 or 1,250.50." },
  { name: "Category", what: "e.g. BLXCK Signature 88000 or Black TEO. A new name makes a new category." },
  { name: "Brand", what: "e.g. BLXCK Signature, Black TEO or XBLACK MAX." },
  { name: "Flavour / variant", what: "Optional second name, e.g. Sweet Smoothie, or a device version like V5." },
  {
    name: "Barcode",
    what: "Letters, numbers, . - and _ only. Leave empty if none. In Excel, set this column to Text first, so long barcodes and leading zeros stay.",
  },
  { name: "Cost per piece", what: "What the supplier charges, in pesos, e.g. 165." },
  { name: "Low-stock alert at", what: "Pieces. Empty = 5." },
  { name: "For sale", what: "yes or no. Empty = yes." },
];

export default async function ImportProductsPage() {
  const { profile } = await requireActiveStaff();
  if (!can(profile, "editProducts")) return <NotAllowed title="Import products" what="Importing products" />;

  return (
    <>
      <Topbar title="Import products" backHref="/inventory" backLabel="Back to inventory" />
      <Main>
        <div className="stack stack-6 narrow">
          <section className="card stack" aria-labelledby="imp-tpl-t">
            <h2 className="card__title" id="imp-tpl-t">
              1. Get the template
            </h2>
            <p className="t-sm muted">
              One row per product or flavour. Open it in Google Sheets or Excel, type your products, and save or download it
              as CSV. Write each product the way it is in the app (Brand BLXCK Signature, Product Mango), so products already
              there are skipped. The two example rows (category Example) are skipped, so you can leave them.
            </p>
            <div className="btn-row">
              <a className="btn btn--secondary" href={TEMPLATE_HREF} download="cloud-factory-products-template.csv">
                <Icon name="download" />
                Download template
              </a>
            </div>
            <dl className="help-words imp-cols">
              {COLUMNS.map((c) => (
                <div key={c.name}>
                  <dt>{c.name}</dt>
                  <dd>{c.what}</dd>
                </div>
              ))}
            </dl>
            <p className="t-sm muted">
              Products already in the app (same brand, product and flavour) are skipped, never changed. Pieces aren&apos;t
              imported: receive them with Restock → Receive batch.
            </p>
          </section>
          <ImportProducts />
        </div>
      </Main>
    </>
  );
}
