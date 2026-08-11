
import Link from "next/link";
import type {
  ExecuteValues, RowDataPacket } from "mysql2";
import { pool } from "@/lib/db";
import styles from "./inventory-report.module.css";
import PrintReportButton from "./print-report-button";

interface ProductRow extends RowDataPacket {
  id: number;
  product_code: string;
  product_name: string;
  category_name: string | null;
  brand_name: string | null;
  supplier_name: string | null;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  stock_value_cost: number;
  stock_value_retail: number;
}

interface SummaryRow extends RowDataPacket {
  total_products: number;
  total_qty: number;
  total_cost_value: number;
  total_retail_value: number;
  low_stock: number;
  out_of_stock: number;
}

interface MovementSummaryRow extends RowDataPacket {
  stock_in_qty: number;
  stock_out_qty: number;
  adjustment_in_qty: number;
  adjustment_out_qty: number;
}

interface BatchRow extends RowDataPacket {
  batch_number: string;
  product_name: string;
  supplier_name: string | null;
  quantity_remaining: number;
  unit_cost: number;
  selling_price: number;
  received_at: Date;
  status: string;
}

interface SupplierRow extends RowDataPacket {
  supplier_name: string;
  total_qty: number;
  total_cost: number;
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value || 0));
}

export default async function InventoryReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;

  const category = typeof p.category === "string" ? p.category.trim() : "";
  const brand = typeof p.brand === "string" ? p.brand.trim() : "";
  const supplier = typeof p.supplier === "string" ? p.supplier.trim() : "";
  const q = typeof p.q === "string" ? p.q.trim() : "";
  const from = typeof p.from === "string" && p.from ? p.from : "";
  const to = typeof p.to === "string" && p.to ? p.to : "";

  const productWhere: string[] = ["p.is_active = 1"];
  const productArgs: ExecuteValues[] = [];

  if (category) {
    productWhere.push("CAST(pc.id AS CHAR) = ?");
    productArgs.push(category);
  }
  if (brand) {
    productWhere.push("CAST(pb.id AS CHAR) = ?");
    productArgs.push(brand);
  }
  if (supplier) {
    productWhere.push("CAST(s.id AS CHAR) = ?");
    productArgs.push(supplier);
  }
  if (q) {
    productWhere.push(`
      (
        CONVERT(p.product_name USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        OR CONVERT(p.product_code USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        OR CONVERT(COALESCE(p.barcode,'') USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
      )
    `);
    const like = `%${q}%`;
    productArgs.push(like, like, like);
  }

  const [products] = await pool.execute<ProductRow[]>(
    `
      SELECT
        p.id,
        p.product_code,
        p.product_name,
        pc.category_name,
        pb.brand_name,
        s.supplier_name,
        p.cost_price,
        p.selling_price,
        p.quantity_on_hand,
        p.reorder_level,
        (p.quantity_on_hand * p.cost_price) AS stock_value_cost,
        (p.quantity_on_hand * p.selling_price) AS stock_value_retail
      FROM products p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN product_brands pb ON pb.id = p.brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE ${productWhere.join(" AND ")}
      ORDER BY p.product_name
    `,
    productArgs,
  );

  const [summaryRows] = await pool.query<SummaryRow[]>(
    `
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(quantity_on_hand), 0) AS total_qty,
        COALESCE(SUM(quantity_on_hand * cost_price), 0) AS total_cost_value,
        COALESCE(SUM(quantity_on_hand * selling_price), 0) AS total_retail_value,
        SUM(CASE WHEN quantity_on_hand > 0 AND quantity_on_hand <= reorder_level THEN 1 ELSE 0 END) AS low_stock,
        SUM(CASE WHEN quantity_on_hand <= 0 THEN 1 ELSE 0 END) AS out_of_stock
      FROM products
      WHERE is_active = 1
    `,
  );

  const movementWhere: string[] = [];
  const movementArgs: ExecuteValues[] = [];
  if (from) {
    movementWhere.push("DATE(im.created_at) >= ?");
    movementArgs.push(from);
  }
  if (to) {
    movementWhere.push("DATE(im.created_at) <= ?");
    movementArgs.push(to);
  }

  const [movementRows] = await pool.execute<MovementSummaryRow[]>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN im.movement_type = 'STOCK_IN' THEN im.quantity_in ELSE 0 END), 0) AS stock_in_qty,
        COALESCE(SUM(CASE WHEN im.movement_type = 'STOCK_OUT' THEN im.quantity_out ELSE 0 END), 0) AS stock_out_qty,
        COALESCE(SUM(CASE WHEN im.movement_type = 'ADJUSTMENT_IN' THEN im.quantity_in ELSE 0 END), 0) AS adjustment_in_qty,
        COALESCE(SUM(CASE WHEN im.movement_type = 'ADJUSTMENT_OUT' THEN im.quantity_out ELSE 0 END), 0) AS adjustment_out_qty
      FROM inventory_movements im
      ${movementWhere.length ? `WHERE ${movementWhere.join(" AND ")}` : ""}
    `,
    movementArgs,
  );

  const batchWhere: string[] = ["b.quantity_remaining > 0", "b.status = 'ACTIVE'"];
  const batchArgs: ExecuteValues[] = [];
  if (supplier) {
    batchWhere.push("CAST(b.supplier_id AS CHAR) = ?");
    batchArgs.push(supplier);
  }

  const [batches] = await pool.execute<BatchRow[]>(
    `
      SELECT
        b.batch_number,
        p.product_name,
        s.supplier_name,
        b.quantity_remaining,
        b.unit_cost,
        b.selling_price,
        b.received_at,
        b.status
      FROM stock_in_batches b
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN suppliers s ON s.id = b.supplier_id
      WHERE ${batchWhere.join(" AND ")}
      ORDER BY b.received_at ASC, b.id ASC
      LIMIT 50
    `,
    batchArgs,
  );

  const supplierDateWhere: string[] = ["st.transaction_type = 'STOCK_IN'"];
  const supplierDateArgs: ExecuteValues[] = [];
  if (from) {
    supplierDateWhere.push("DATE(st.transaction_date) >= ?");
    supplierDateArgs.push(from);
  }
  if (to) {
    supplierDateWhere.push("DATE(st.transaction_date) <= ?");
    supplierDateArgs.push(to);
  }

  const [supplierRows] = await pool.execute<SupplierRow[]>(
    `
      SELECT
        COALESCE(s.supplier_name, 'No Supplier') AS supplier_name,
        COALESCE(SUM(sti.quantity), 0) AS total_qty,
        COALESCE(SUM(sti.subtotal), 0) AS total_cost
      FROM stock_transactions st
      INNER JOIN stock_transaction_items sti ON sti.stock_transaction_id = st.id
      LEFT JOIN suppliers s ON s.id = st.supplier_id
      WHERE ${supplierDateWhere.join(" AND ")}
      GROUP BY s.id, s.supplier_name
      ORDER BY total_cost DESC
      LIMIT 15
    `,
    supplierDateArgs,
  );

  const [categories] = await pool.query<any[]>(
    "SELECT id, category_name FROM product_categories WHERE is_active=1 ORDER BY category_name",
  );
  const [brands] = await pool.query<any[]>(
    "SELECT id, brand_name FROM product_brands WHERE is_active=1 ORDER BY brand_name",
  );
  const [suppliers] = await pool.query<any[]>(
    "SELECT id, supplier_name FROM suppliers WHERE is_active=1 ORDER BY supplier_name",
  );

  const summary = summaryRows[0] ?? {
    total_products: 0,
    total_qty: 0,
    total_cost_value: 0,
    total_retail_value: 0,
    low_stock: 0,
    out_of_stock: 0,
  };

  const movement = movementRows[0] ?? {
    stock_in_qty: 0,
    stock_out_qty: 0,
    adjustment_in_qty: 0,
    adjustment_out_qty: 0,
  };

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/reports">← Reports</Link>
        <PrintReportButton />
      </div>

      <section className={styles.report}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>KL MOTOR SHOP</div>
            <h1>Inventory Report</h1>
            <p>
              Current stock position
              {(from || to) && ` • Movements ${from || "beginning"} to ${to || "today"}`}
            </p>
          </div>
        </header>

        <form className={styles.filters}>
          <label>
            From
            <input type="date" name="from" defaultValue={from} />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={to} />
          </label>
          <label>
            Category
            <select name="category" defaultValue={category}>
              <option value="">All categories</option>
              {categories.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.category_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Brand
            <select name="brand" defaultValue={brand}>
              <option value="">All brands</option>
              {brands.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.brand_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Supplier
            <select name="supplier" defaultValue={supplier}>
              <option value="">All suppliers</option>
              {suppliers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.supplier_name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.searchField}>
            Search
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Product, code, barcode..."
            />
          </label>
          <button type="submit">Apply Filters</button>
        </form>

        <section className={styles.kpis}>
          <article>
            <span>Products</span>
            <strong>{summary.total_products}</strong>
          </article>
          <article>
            <span>Total Quantity</span>
            <strong>{Number(summary.total_qty).toLocaleString()}</strong>
          </article>
          <article>
            <span>Cost Valuation</span>
            <strong>{peso(summary.total_cost_value)}</strong>
          </article>
          <article>
            <span>Retail Valuation</span>
            <strong>{peso(summary.total_retail_value)}</strong>
          </article>
          <article>
            <span>Low Stock</span>
            <strong>{summary.low_stock}</strong>
          </article>
          <article>
            <span>Out of Stock</span>
            <strong>{summary.out_of_stock}</strong>
          </article>
        </section>

        <section className={styles.twoCols}>
          <article className={styles.panel}>
            <h2>Movement Summary</h2>
            <dl className={styles.summaryList}>
              <div><dt>Stock In</dt><dd>+{Number(movement.stock_in_qty).toLocaleString()}</dd></div>
              <div><dt>Stock Out</dt><dd>-{Number(movement.stock_out_qty).toLocaleString()}</dd></div>
              <div><dt>Adjustment In</dt><dd>+{Number(movement.adjustment_in_qty).toLocaleString()}</dd></div>
              <div><dt>Adjustment Out</dt><dd>-{Number(movement.adjustment_out_qty).toLocaleString()}</dd></div>
            </dl>
          </article>

          <article className={styles.panel}>
            <h2>Supplier Stock-In</h2>
            <div className={styles.smallTableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Qty</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierRows.length ? supplierRows.map((row) => (
                    <tr key={row.supplier_name}>
                      <td>{row.supplier_name}</td>
                      <td>{Number(row.total_qty).toLocaleString()}</td>
                      <td>{peso(row.total_cost)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={3}>No stock-in data for selected dates.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <article className={styles.panel}>
          <h2>Current Stock</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Supplier</th>
                  <th className={styles.num}>On Hand</th>
                  <th className={styles.num}>Reorder</th>
                  <th className={styles.num}>Cost</th>
                  <th className={styles.num}>Selling</th>
                  <th className={styles.num}>Cost Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.length ? products.map((row) => {
                  const out = Number(row.quantity_on_hand) <= 0;
                  const low = !out && Number(row.quantity_on_hand) <= Number(row.reorder_level);
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.product_name}</strong>
                        <small>{row.product_code}</small>
                      </td>
                      <td>{row.category_name ?? "—"}</td>
                      <td>{row.brand_name ?? "—"}</td>
                      <td>{row.supplier_name ?? "—"}</td>
                      <td className={styles.num}>{Number(row.quantity_on_hand).toLocaleString()}</td>
                      <td className={styles.num}>{Number(row.reorder_level).toLocaleString()}</td>
                      <td className={styles.num}>{peso(row.cost_price)}</td>
                      <td className={styles.num}>{peso(row.selling_price)}</td>
                      <td className={styles.num}>{peso(row.stock_value_cost)}</td>
                      <td>
                        <span className={out ? styles.out : low ? styles.low : styles.ok}>
                          {out ? "OUT OF STOCK" : low ? "LOW STOCK" : "IN STOCK"}
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={10}>No products match the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panel}>
          <h2>Available Batches</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th>Received</th>
                  <th className={styles.num}>Remaining</th>
                  <th className={styles.num}>Unit Cost</th>
                  <th className={styles.num}>Selling Price</th>
                </tr>
              </thead>
              <tbody>
                {batches.length ? batches.map((row) => (
                  <tr key={row.batch_number}>
                    <td>{row.batch_number}</td>
                    <td>{row.product_name}</td>
                    <td>{row.supplier_name ?? "—"}</td>
                    <td>{new Date(row.received_at).toLocaleDateString("en-PH")}</td>
                    <td className={styles.num}>{Number(row.quantity_remaining).toLocaleString()}</td>
                    <td className={styles.num}>{peso(row.unit_cost)}</td>
                    <td className={styles.num}>{peso(row.selling_price)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7}>No active batches found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
