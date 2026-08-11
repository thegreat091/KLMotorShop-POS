import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ClipboardList,
  PackageCheck,
  PackageOpen,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./supplier-profile.module.css";

interface SupplierRow extends RowDataPacket {
  id:number;
  supplier_name:string;
  contact_person:string|null;
  mobile_number:string|null;
  telephone_number:string|null;
  address:string|null;
  is_active:number;
}

interface SummaryRow extends RowDataPacket {
  total_pos:number;
  pending_pos:number;
  total_purchased:number;
  last_po_date:Date|string|null;
  total_received_qty:number;
}

interface PORow extends RowDataPacket {
  id:number;
  po_number:string;
  order_date:Date|string;
  expected_date:Date|string|null;
  status:string;
  total_amount:number;
  ordered_qty:number;
  received_qty:number;
}

interface ProductRow extends RowDataPacket {
  id:number;
  product_code:string;
  product_name:string;
  quantity_on_hand:number;
  reorder_level:number;
  total_ordered:number;
  total_received:number;
  last_order_date:Date|string|null;
}

interface ReceiveRow extends RowDataPacket {
  stock_transaction_id:number;
  reference_number:string;
  transaction_date:Date|string;
  supplier_reference:string|null;
  purchase_order_id:number|null;
  po_number:string|null;
  total_qty:number;
  total_cost:number;
}

function money(v:number){
  return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));
}
function dt(v:Date|string|null){
  if(!v) return "—";
  return new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
}

export default async function SupplierProfilePage({params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) redirect("/");
  if(!["ADMIN","OWNER","INVENTORY"].includes(user.role)) redirect("/dashboard");

  const {id:raw}=await params;
  const id=Number(raw);
  if(!Number.isInteger(id)||id<=0) notFound();

  const [supplierRows]=await pool.execute<SupplierRow[]>(
    `SELECT id,supplier_name,contact_person,mobile_number,telephone_number,address,is_active
     FROM suppliers WHERE id=? LIMIT 1`,[id]
  );
  const supplier=supplierRows[0];
  if(!supplier) notFound();

  const [summaryRows]=await pool.execute<SummaryRow[]>(
    `SELECT
       COUNT(DISTINCT po.id) total_pos,
       COUNT(DISTINCT CASE WHEN po.status IN ('ORDERED','PARTIALLY_RECEIVED') THEN po.id END) pending_pos,
       COALESCE(SUM(po.total_amount),0) total_purchased,
       MAX(po.order_date) last_po_date,
       COALESCE((
         SELECT SUM(sti.quantity)
         FROM stock_transactions st
         JOIN stock_transaction_items sti ON sti.stock_transaction_id=st.id
         WHERE st.transaction_type='STOCK_IN' AND st.supplier_id=?
       ),0) total_received_qty
     FROM purchase_orders po
     WHERE po.supplier_id=? AND po.status<>'CANCELLED'`,
    [id,id]
  );
  const summary=summaryRows[0]??{total_pos:0,pending_pos:0,total_purchased:0,last_po_date:null,total_received_qty:0};

  const [pos]=await pool.execute<PORow[]>(
    `SELECT
       po.id,po.po_number,po.order_date,po.expected_date,po.status,po.total_amount,
       COALESCE(SUM(poi.quantity_ordered),0) ordered_qty,
       COALESCE(SUM(poi.quantity_received),0) received_qty
     FROM purchase_orders po
     LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
     WHERE po.supplier_id=?
     GROUP BY po.id,po.po_number,po.order_date,po.expected_date,po.status,po.total_amount
     ORDER BY po.order_date DESC,po.id DESC
     LIMIT 100`,
    [id]
  );

  const [products]=await pool.execute<ProductRow[]>(
    `SELECT
       p.id,p.product_code,p.product_name,p.quantity_on_hand,p.reorder_level,
       COALESCE(SUM(CASE WHEN po.id IS NOT NULL THEN poi.quantity_ordered ELSE 0 END),0) total_ordered,
       COALESCE(SUM(CASE WHEN po.id IS NOT NULL THEN poi.quantity_received ELSE 0 END),0) total_received,
       MAX(CASE WHEN po.id IS NOT NULL THEN po.order_date END) last_order_date
     FROM products p
     LEFT JOIN purchase_order_items poi ON poi.product_id=p.id
     LEFT JOIN purchase_orders po ON po.id=poi.purchase_order_id AND po.supplier_id=?
     WHERE p.supplier_id=? OR po.id IS NOT NULL
     GROUP BY p.id,p.product_code,p.product_name,p.quantity_on_hand,p.reorder_level
     ORDER BY p.product_name
     LIMIT 200`,
    [id,id]
  );

  const [receives]=await pool.execute<ReceiveRow[]>(
    `SELECT
       st.id stock_transaction_id,
       st.reference_number,
       st.transaction_date,
       sim.supplier_reference,
       sim.purchase_order_id,
       po.po_number,
       COALESCE(SUM(sti.quantity),0) total_qty,
       COALESCE(SUM(sti.subtotal),0) total_cost
     FROM stock_transactions st
     JOIN stock_transaction_items sti ON sti.stock_transaction_id=st.id
     LEFT JOIN stock_in_meta sim ON sim.stock_transaction_id=st.id
     LEFT JOIN purchase_orders po ON po.id=sim.purchase_order_id
     WHERE st.transaction_type='STOCK_IN' AND st.supplier_id=?
     GROUP BY st.id,st.reference_number,st.transaction_date,sim.supplier_reference,sim.purchase_order_id,po.po_number
     ORDER BY st.transaction_date DESC,st.id DESC
     LIMIT 100`,
    [id]
  );

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/suppliers">
          <ArrowLeft size={17} />
          Suppliers
        </Link>

        <Link href="/purchasing">
          <ShoppingCart size={17} />
          Purchasing
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Supplier Profile</div>
          <h1>{supplier.supplier_name}</h1>
          <p>
            {supplier.contact_person ?? "No contact person"} •{" "}
            {supplier.mobile_number ??
              supplier.telephone_number ??
              "No contact number"}
          </p>
        </div>

        <div className={styles.heroIcon}>
          <Building2 size={30} />
        </div>
      </section>

      <section className={styles.metrics}>
        <article>
          <ClipboardList />
          <span>Purchase Orders</span>
          <strong>{summary.total_pos}</strong>
        </article>

        <article>
          <Truck />
          <span>Pending POs</span>
          <strong>{summary.pending_pos}</strong>
        </article>

        <article>
          <ShoppingCart />
          <span>Total PO Value</span>
          <strong>{money(summary.total_purchased)}</strong>
        </article>

        <article>
          <PackageCheck />
          <span>Qty Received</span>
          <strong>{Number(summary.total_received_qty).toFixed(2)}</strong>
        </article>

        <article>
          <CalendarDays />
          <span>Last PO</span>
          <strong>
            {summary.last_po_date
              ? new Date(summary.last_po_date).toLocaleDateString("en-PH")
              : "—"}
          </strong>
        </article>
      </section>

      <section className={styles.overviewGrid}>
        <article className={`${styles.card} ${styles.detailsCard}`}>
          <header>
            <div>
              <span>Contact Information</span>
              <h2>Supplier Details</h2>
            </div>
          </header>

          <dl className={styles.infoList}>
            <div>
              <dt>Contact Person</dt>
              <dd>{supplier.contact_person ?? "—"}</dd>
            </div>

            <div>
              <dt>Mobile</dt>
              <dd>{supplier.mobile_number ?? "—"}</dd>
            </div>

            <div>
              <dt>Telephone</dt>
              <dd>{supplier.telephone_number ?? "—"}</dd>
            </div>

            <div>
              <dt>Address</dt>
              <dd>{supplier.address ?? "—"}</dd>
            </div>

            <div>
              <dt>Status</dt>
              <dd>
                <span
                  className={
                    supplier.is_active
                      ? styles.activeBadge
                      : styles.inactiveBadge
                  }
                >
                  {supplier.is_active ? "ACTIVE" : "INACTIVE"}
                </span>
              </dd>
            </div>
          </dl>
        </article>

        <article className={`${styles.card} ${styles.receivingCard}`}>
          <header>
            <div>
              <span>Recent Delivery</span>
              <h2>Receiving Summary</h2>
            </div>

            <PackageCheck size={21} />
          </header>

          {receives.length ? (
            <div className={styles.deliveryList}>
              {receives.slice(0, 5).map((r) => (
                <div
                  key={r.stock_transaction_id}
                  className={styles.deliveryItem}
                >
                  <div className={styles.deliveryMain}>
                    <strong>{r.reference_number}</strong>
                    <span>
                      {r.po_number ??
                        r.supplier_reference ??
                        "Manual Stock In"}
                    </span>
                  </div>

                  <div className={styles.deliveryMeta}>
                    <strong>{Number(r.total_qty).toFixed(2)} qty</strong>
                    <span>{money(r.total_cost)}</span>
                    <small>{dt(r.transaction_date)}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyPanel}>
              No receiving history for this supplier.
            </div>
          )}
        </article>
      </section>

      <section className={styles.card}>
        <header>
          <div>
            <span>Purchasing History</span>
            <h2>Purchase Orders</h2>
          </div>

          <Link href="/purchasing/purchase-orders">View All POs</Link>
        </header>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>PO</th>
                <th>Status</th>
                <th>Ordered Qty</th>
                <th>Received Qty</th>
                <th>Expected</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {pos.map((r) => (
                <tr key={r.id}>
                  <td>{dt(r.order_date)}</td>
                  <td>
                    <strong>{r.po_number}</strong>
                  </td>
                  <td>
                    <span className={styles.poStatus}>
                      {r.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{Number(r.ordered_qty).toFixed(2)}</td>
                  <td>{Number(r.received_qty).toFixed(2)}</td>
                  <td>
                    {r.expected_date
                      ? new Date(r.expected_date).toLocaleDateString("en-PH")
                      : "—"}
                  </td>
                  <td>{money(r.total_amount)}</td>
                  <td>
                    <Link href={`/purchasing/purchase-orders/${r.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}

              {!pos.length ? (
                <tr>
                  <td colSpan={8} className={styles.empty}>
                    No purchase orders for this supplier yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <header>
          <div>
            <span>Receiving History</span>
            <h2>Stock Received</h2>
          </div>

          <Truck size={21} />
        </header>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Stock In</th>
                <th>Purchase Order</th>
                <th>Supplier Reference</th>
                <th>Qty Received</th>
                <th>Total Cost</th>
              </tr>
            </thead>

            <tbody>
              {receives.map((r) => (
                <tr key={r.stock_transaction_id}>
                  <td>{dt(r.transaction_date)}</td>
                  <td>
                    <strong>{r.reference_number}</strong>
                  </td>
                  <td>{r.po_number ?? "Manual Stock In"}</td>
                  <td>{r.supplier_reference ?? "—"}</td>
                  <td>{Number(r.total_qty).toFixed(2)}</td>
                  <td>{money(r.total_cost)}</td>
                </tr>
              ))}

              {!receives.length ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    No receiving records for this supplier.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <header>
          <div>
            <span>Products Supplied</span>
            <h2>Products</h2>
          </div>

          <PackageOpen size={21} />
        </header>

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>On Hand</th>
                <th>Reorder</th>
                <th>Total Ordered</th>
                <th>Total Received</th>
                <th>Last Ordered</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {products.map((r) => {
                const low =
                  Number(r.quantity_on_hand) <= Number(r.reorder_level);

                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.product_name}</strong>
                      <small>{r.product_code}</small>
                    </td>
                    <td>{Number(r.quantity_on_hand).toFixed(2)}</td>
                    <td>{Number(r.reorder_level).toFixed(2)}</td>
                    <td>{Number(r.total_ordered).toFixed(2)}</td>
                    <td>{Number(r.total_received).toFixed(2)}</td>
                    <td>
                      {r.last_order_date
                        ? new Date(r.last_order_date).toLocaleDateString("en-PH")
                        : "—"}
                    </td>
                    <td>
                      <span className={low ? styles.low : styles.ok}>
                        {low ? "NEEDS REORDER" : "OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!products.length ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    No products linked to this supplier.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
