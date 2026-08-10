import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Barcode,
  Boxes,
  CircleDollarSign,
  Clock3,
  PackageCheck,
  PackageSearch,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import InquiryForm from "./inquiry-form";
import styles from "./stock-inquiry.module.css";

interface ProductRow extends RowDataPacket {
  id: number;
  product_code: string;
  barcode: string | null;
  product_name: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  is_active: number;
  category_name: string | null;
  brand_name: string | null;
  supplier_name: string | null;
}

interface BatchRow extends RowDataPacket {
  id: number;
  stock_transaction_id: number;
  supplier_name: string | null;
  batch_number: string;
  barcode: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  selling_price: number;
  received_at: Date;
  status: "ACTIVE" | "DEPLETED" | "CANCELLED";
}

interface MovementRow extends RowDataPacket {
  id: number;
  movement_type: string;
  reference_id: string | null;
  reference_number: string | null;
  quantity_in: number;
  quantity_out: number;
  balance_after: number;
  remarks: string | null;
  created_at: Date;
}

interface SearchResultRow extends RowDataPacket {
  id: number;
  product_code: string;
  barcode: string | null;
  product_name: string;
  quantity_on_hand: number;
  unit: string;
}

interface BatchMatchRow extends RowDataPacket {
  product_id: number;
  batch_id: number;
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function qty(value: number) {
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
  }).format(value);
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function movementLabel(type: string) {
  return type.replaceAll("_", " ");
}

export default async function StockInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; product?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "OWNER", "CASHIER", "INVENTORY"].includes(user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const productParam = Number(params.product ?? 0);
  let productId = Number.isFinite(productParam) ? productParam : 0;
  let matchedBatchId = 0;
  let searchResults: SearchResultRow[] = [];

  if (!productId && q) {
    const [batchMatches] = await pool.execute<BatchMatchRow[]>(
      `
        SELECT product_id, id AS batch_id
        FROM stock_in_batches
        WHERE barcode = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
        LIMIT 1
      `,
      [q],
    );

    if (batchMatches.length > 0) {
      productId = Number(batchMatches[0].product_id);
      matchedBatchId = Number(batchMatches[0].batch_id);
    } else {
      const [exactProducts] = await pool.execute<ProductRow[]>(
        `
          SELECT p.id, p.product_code, p.barcode, p.product_name, p.unit,
                 p.cost_price, p.selling_price, p.quantity_on_hand,
                 p.reorder_level, p.is_active,
                 pc.category_name, pb.brand_name, s.supplier_name
          FROM products p
          LEFT JOIN product_categories pc ON pc.id = p.category_id
          LEFT JOIN product_brands pb ON pb.id = p.brand_id
          LEFT JOIN suppliers s ON s.id = p.supplier_id
          WHERE p.product_code = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
             OR COALESCE(p.barcode, '') = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
          ORDER BY p.is_active DESC, p.id
          LIMIT 1
        `,
        [q, q],
      );

      if (exactProducts.length > 0) {
        productId = Number(exactProducts[0].id);
      } else {
        const like = `%${q}%`;
        const [partial] = await pool.execute<SearchResultRow[]>(
          `
            SELECT id, product_code, barcode, product_name, quantity_on_hand, unit
            FROM products
            WHERE product_name LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
               OR product_code LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
               OR COALESCE(barcode, '') LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
            ORDER BY is_active DESC, product_name
            LIMIT 25
          `,
          [like, like, like],
        );
        searchResults = partial;
        if (partial.length === 1) productId = Number(partial[0].id);
      }
    }
  }

  let product: ProductRow | null = null;
  let batches: BatchRow[] = [];
  let movements: MovementRow[] = [];

  if (productId) {
    const [products] = await pool.execute<ProductRow[]>(
      `
        SELECT p.id, p.product_code, p.barcode, p.product_name, p.unit,
               p.cost_price, p.selling_price, p.quantity_on_hand,
               p.reorder_level, p.is_active,
               pc.category_name, pb.brand_name, s.supplier_name
        FROM products p
        LEFT JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN product_brands pb ON pb.id = p.brand_id
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.id = ?
        LIMIT 1
      `,
      [productId],
    );
    product = products[0] ?? null;

    if (product) {
      const [batchRows] = await pool.execute<BatchRow[]>(
        `
          SELECT b.id, b.stock_transaction_id, s.supplier_name,
                 b.batch_number, b.barcode, b.quantity_received,
                 b.quantity_remaining, b.unit_cost, b.selling_price,
                 b.received_at, b.status
          FROM stock_in_batches b
          LEFT JOIN suppliers s ON s.id = b.supplier_id
          WHERE b.product_id = ?
          ORDER BY
            CASE b.status WHEN 'ACTIVE' THEN 0 WHEN 'DEPLETED' THEN 1 ELSE 2 END,
            b.received_at DESC,
            b.id DESC
        `,
        [product.id],
      );
      batches = batchRows;

      const [movementRows] = await pool.execute<MovementRow[]>(
        `
          SELECT im.id, im.movement_type, im.reference_id,
                 COALESCE(st.reference_number, sa.sale_number, im.reference_id) AS reference_number,
                 im.quantity_in, im.quantity_out, im.balance_after,
                 im.remarks, im.created_at
          FROM inventory_movements im
          LEFT JOIN stock_transactions st
            ON im.reference_table = 'stock_transactions'
           AND st.id = CAST(im.reference_id AS UNSIGNED)
          LEFT JOIN sales sa
            ON im.reference_table = 'sales'
           AND sa.id = CAST(im.reference_id AS UNSIGNED)
          WHERE im.product_id = ?
          ORDER BY im.created_at DESC, im.id DESC
          LIMIT 12
        `,
        [product.id],
      );
      movements = movementRows;
    }
  }

  const activeBatchQty = batches
    .filter((b) => b.status === "ACTIVE")
    .reduce((sum, b) => sum + Number(b.quantity_remaining), 0);

  const stockState = product
    ? product.quantity_on_hand <= 0
      ? "OUT OF STOCK"
      : product.quantity_on_hand <= product.reorder_level
        ? "LOW STOCK"
        : "IN STOCK"
    : "";

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/dashboard" className={styles.backLink}>
          <ArrowLeft size={17} /> Dashboard
        </Link>
        <div className={styles.heroTitle}>
          <div className={styles.heroIcon}><PackageSearch size={28} /></div>
          <div>
            <p>Inventory</p>
            <h1>Stock Inquiry</h1>
            <span>Scan a barcode or search a product to check live stock and batch history.</span>
          </div>
        </div>
      </header>

      <section className={styles.content}>
        <section className={styles.scannerCard}>
          <div>
            <p>Barcode / Product Lookup</p>
            <h2>Scan or search</h2>
          </div>
          <InquiryForm initialValue={q} />
          <span className={styles.scanHint}>
            USB scanners usually send Enter automatically. Supports KL batch barcode, factory barcode, product code, and product name.
          </span>
        </section>

        {!product && q && searchResults.length === 0 ? (
          <div className={styles.messageCard}>
            <TriangleAlert size={24} />
            <div><strong>No product found</strong><span>No product or batch matched “{q}”.</span></div>
          </div>
        ) : null}

        {!product && searchResults.length > 1 ? (
          <section className={styles.resultsCard}>
            <div className={styles.sectionHeader}>
              <div><p>Search Results</p><h2>Select a product</h2></div>
              <span>{searchResults.length} matches</span>
            </div>
            <div className={styles.resultGrid}>
              {searchResults.map((item) => (
                <Link key={item.id} href={`/inventory/stock-inquiry?product=${item.id}&q=${encodeURIComponent(q)}`} className={styles.resultItem}>
                  <div><strong>{item.product_name}</strong><span>{item.product_code}{item.barcode ? ` • ${item.barcode}` : ""}</span></div>
                  <b>{qty(Number(item.quantity_on_hand))} {item.unit}</b>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {product ? (
          <>
            <section className={styles.productCard}>
              <div className={styles.productTop}>
                <div>
                  <p>Product Information</p>
                  <h2>{product.product_name}</h2>
                  <span>{product.product_code}{product.barcode ? ` • ${product.barcode}` : ""}</span>
                </div>
                <div className={`${styles.stockBadge} ${stockState === "IN STOCK" ? styles.good : stockState === "LOW STOCK" ? styles.low : styles.out}`}>
                  {stockState}
                </div>
              </div>

              <div className={styles.metrics}>
                <article><Boxes size={22} /><span>Current Stock</span><strong>{qty(Number(product.quantity_on_hand))} {product.unit}</strong></article>
                <article><PackageCheck size={22} /><span>Active Batch Stock</span><strong>{qty(activeBatchQty)} {product.unit}</strong></article>
                <article><TriangleAlert size={22} /><span>Reorder Level</span><strong>{qty(Number(product.reorder_level))} {product.unit}</strong></article>
                <article><CircleDollarSign size={22} /><span>Selling Price</span><strong>{money(Number(product.selling_price))}</strong></article>
              </div>

              <div className={styles.detailGrid}>
                <div><span>Category</span><strong>{product.category_name ?? "—"}</strong></div>
                <div><span>Brand</span><strong>{product.brand_name ?? "—"}</strong></div>
                <div><span>Default Supplier</span><strong>{product.supplier_name ?? "—"}</strong></div>
                <div><span>Unit Cost</span><strong>{money(Number(product.cost_price))}</strong></div>
              </div>

              <div className={styles.quickActions}>
                <Link href={`/products/${product.id}`}>Open Product</Link>
                {["ADMIN", "INVENTORY", "OWNER"].includes(user.role) ? (
                  <Link href={`/inventory/ledger?search=${encodeURIComponent(product.product_code)}`}>View Ledger</Link>
                ) : null}
                {["ADMIN", "INVENTORY"].includes(user.role) ? (
                  <Link href="/inventory/stock-in/new">Stock In</Link>
                ) : null}
              </div>
            </section>

            <section className={styles.twoColumn}>
              <div className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div><p>Batch Inventory</p><h2>Stock batches</h2></div>
                  <span>{batches.length} batches</span>
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>Batch</th><th>Supplier</th><th>Received</th><th>Remaining</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {batches.length === 0 ? (
                        <tr><td colSpan={6} className={styles.empty}>No stock-in batches recorded.</td></tr>
                      ) : batches.map((batch) => (
                        <tr key={batch.id} className={matchedBatchId === batch.id ? styles.highlightRow : undefined}>
                          <td><strong>{batch.batch_number}</strong><small><Barcode size={13} /> {batch.barcode}</small></td>
                          <td>{batch.supplier_name ?? "—"}</td>
                          <td><span>{qty(Number(batch.quantity_received))} {product.unit}</span><small><Clock3 size={13} /> {dateTime(batch.received_at)}</small></td>
                          <td><strong>{qty(Number(batch.quantity_remaining))} {product.unit}</strong></td>
                          <td><span className={styles.batchStatus}>{batch.status}</span></td>
                          <td><Link className={styles.smallLink} href={`/inventory/stock-in/${batch.stock_transaction_id}/labels`}>Print Barcode</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div><p>Inventory Ledger</p><h2>Recent movements</h2></div>
                  <span>Latest {movements.length}</span>
                </div>
                <div className={styles.movementList}>
                  {movements.length === 0 ? <div className={styles.emptyList}>No inventory movements recorded.</div> : movements.map((movement) => (
                    <div key={movement.id} className={styles.movementItem}>
                      <div className={styles.movementMain}>
                        <strong>{movementLabel(movement.movement_type)}</strong>
                        <span>{movement.reference_number ?? "No reference"} • {dateTime(movement.created_at)}</span>
                        {movement.remarks ? <small>{movement.remarks}</small> : null}
                      </div>
                      <div className={styles.movementQty}>
                        {Number(movement.quantity_in) > 0 ? <b className={styles.qtyIn}>+{qty(Number(movement.quantity_in))}</b> : <b className={styles.qtyOut}>-{qty(Number(movement.quantity_out))}</b>}
                        <span>Bal. {qty(Number(movement.balance_after))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : !q ? (
          <div className={styles.emptyStart}>
            <PackageSearch size={40} />
            <h2>Ready to scan</h2>
            <p>Scan a product sticker or enter a product name/code above.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
