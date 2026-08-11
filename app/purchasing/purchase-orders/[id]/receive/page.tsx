import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Boxes,
  PackageCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { receivePurchaseOrderAction } from "./actions";
import styles from "./receive.module.css";

interface PORow extends RowDataPacket {
  id: number;
  po_number: string;
  supplier_name: string;
  status: string;
  order_date: Date | string;
}

interface ItemRow extends RowDataPacket {
  id: number;
  product_name: string;
  product_code: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  selling_price: number;
}

type Query = { error?: string };

export default async function ReceivePOPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  if (!["ADMIN", "INVENTORY"].includes(user.role)) {
    redirect("/purchasing");
  }

  const { id: raw } = await params;
  const id = Number(raw);

  if (!Number.isInteger(id) || id <= 0) notFound();

  const query = await searchParams;

  const [poRows] = await pool.execute<PORow[]>(
    `
      SELECT
        po.id,
        po.po_number,
        s.supplier_name,
        po.status,
        po.order_date
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.id = ?
      LIMIT 1
    `,
    [id],
  );

  const po = poRows[0];

  if (!po) notFound();

  const [items] = await pool.execute<ItemRow[]>(
    `
      SELECT
        poi.id,
        p.product_name,
        p.product_code,
        poi.quantity_ordered,
        poi.quantity_received,
        poi.unit_cost,
        p.selling_price
      FROM purchase_order_items poi
      JOIN products p ON p.id = poi.product_id
      WHERE poi.purchase_order_id = ?
      ORDER BY p.product_name
    `,
    [id],
  );

  const openItems = items.filter(
    (item) =>
      Number(item.quantity_received) + 0.0001 <
      Number(item.quantity_ordered),
  );

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link
          href={`/purchasing/purchase-orders/${id}`}
          className={styles.back}
        >
          <ArrowLeft size={17} />
          Purchase Order
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Purchasing → Stock In</div>
          <h1>Receive {po.po_number}</h1>
          <p>
            Supplier: {po.supplier_name} • Current status:{" "}
            {po.status.replaceAll("_", " ")}
          </p>
        </div>
        <Truck size={46} />
      </section>

      {query.error ? (
        <div className={styles.error}>{query.error}</div>
      ) : null}

      {["RECEIVED", "CANCELLED"].includes(po.status) ? (
        <section className={styles.complete}>
          <PackageCheck size={26} />
          <div>
            <strong>
              {po.status === "RECEIVED"
                ? "Purchase order fully received"
                : "Purchase order cancelled"}
            </strong>
            <span>
              {po.status === "RECEIVED"
                ? "There are no remaining quantities to receive."
                : "Cancelled purchase orders cannot be received."}
            </span>
          </div>
        </section>
      ) : (
        <form
          action={receivePurchaseOrderAction}
          className={styles.card}
        >
          <input type="hidden" name="purchase_order_id" value={id} />

          <header>
            <Boxes size={21} />
            <div>
              <h2>Delivery Quantities</h2>
              <p>
                Enter only the quantity physically received today. Partial
                receiving is allowed.
              </p>
            </div>
          </header>

          <div className={styles.meta}>
            <label>
              Supplier Delivery / Invoice Reference
              <input
                name="supplier_reference"
                placeholder="e.g. INV-12345"
              />
            </label>

            <label>
              Receiving Remarks
              <input
                name="remarks"
                placeholder="Optional delivery notes..."
              />
            </label>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Ordered</th>
                  <th>Previously Received</th>
                  <th>Remaining</th>
                  <th>Receive Now</th>
                  <th>Unit Cost</th>
                  <th>Selling Price</th>
                </tr>
              </thead>
              <tbody>
                {openItems.map((item) => {
                  const remaining =
                    Number(item.quantity_ordered) -
                    Number(item.quantity_received);

                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="hidden"
                          name="po_item_id"
                          value={item.id}
                        />
                        <strong>{item.product_name}</strong>
                        <small>{item.product_code}</small>
                      </td>
                      <td>
                        {Number(item.quantity_ordered).toFixed(2)}
                      </td>
                      <td>
                        {Number(item.quantity_received).toFixed(2)}
                      </td>
                      <td>
                        <strong>{remaining.toFixed(2)}</strong>
                      </td>
                      <td>
                        <input
                          type="number"
                          name="receive_quantity"
                          min="0"
                          max={remaining}
                          step="0.01"
                          defaultValue={remaining}
                        />
                      </td>
                      <td>
                        ₱{Number(item.unit_cost).toFixed(2)}
                      </td>
                      <td>
                        ₱{Number(item.selling_price).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.footer}>
            <span>
              After receiving, the system will create the Stock In batches and
              open the 2×1 barcode-label print page.
            </span>
            <button type="submit">
              <PackageCheck size={17} />
              Receive into Stock
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
