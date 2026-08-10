import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Boxes,
  CircleDollarSign,
  Edit3,
  PackageSearch,
  Plus,
  Search,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { toggleProductStatus } from "./actions";
import styles from "./products.module.css";

interface ProductRow extends RowDataPacket {
  id: number;
  product_code: string;
  barcode: string | null;
  product_name: string;
  category_name: string | null;
  brand_name: string | null;
  supplier_name: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  reorder_level: number;
  is_active: number;
}

interface ProductsPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    stock?: string;
    success?: string;
    error?: string;
  }>;
}

function peso(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  const canViewProducts =
    user.role === "ADMIN" ||
    user.role === "INVENTORY" ||
    user.role === "OWNER" ||
    user.role === "CASHIER";

  if (!canViewProducts) redirect("/dashboard");

  const canManageProducts = user.role === "ADMIN" || user.role === "INVENTORY";
  const parameters = await searchParams;
  const search = parameters.search?.trim() ?? "";
  const status = parameters.status?.trim().toUpperCase() ?? "ALL";
  const stock = parameters.stock?.trim().toUpperCase() ?? "ALL";

  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (search) {
    conditions.push(`(
      p.product_code LIKE ? OR p.barcode LIKE ? OR p.product_name LIKE ?
      OR pc.category_name LIKE ? OR pb.brand_name LIKE ? OR s.supplier_name LIKE ?
    )`);
    const value = `%${search}%`;
    values.push(value, value, value, value, value, value);
  }

  if (status === "ACTIVE") conditions.push("p.is_active = 1");
  if (status === "INACTIVE") conditions.push("p.is_active = 0");
  if (stock === "LOW") conditions.push("p.quantity_on_hand <= p.reorder_level");
  if (stock === "OUT") conditions.push("p.quantity_on_hand <= 0");
  if (stock === "AVAILABLE") conditions.push("p.quantity_on_hand > p.reorder_level");

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [products] = await pool.query<ProductRow[]>(
    `
      SELECT
        p.id,
        p.product_code,
        p.barcode,
        p.product_name,
        pc.category_name,
        pb.brand_name,
        s.supplier_name,
        p.unit,
        p.cost_price,
        p.selling_price,
        p.quantity_on_hand,
        p.reorder_level,
        p.is_active
      FROM products p
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN product_brands pb ON pb.id = p.brand_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      ${whereClause}
      ORDER BY p.is_active DESC, p.product_name ASC
    `,
    values,
  );

  const activeCount = products.filter((product) => product.is_active === 1).length;
  const lowStockCount = products.filter(
    (product) => product.is_active === 1 && product.quantity_on_hand <= product.reorder_level,
  ).length;
  const inventoryValue = products.reduce(
    (sum, product) => sum + Number(product.quantity_on_hand) * Number(product.cost_price),
    0,
  );

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/dashboard" className={styles.backButton}>
            <ArrowLeft size={19} /> Dashboard
          </Link>

          <div className={styles.titleBlock}>
            <div className={styles.titleIcon}><PackageSearch size={28} /></div>
            <div>
              <p>Inventory Master Data</p>
              <h1>Products</h1>
              <span>Manage motorcycle parts, accessories, oils, prices, and stock levels.</span>
            </div>
          </div>
        </div>

        {canManageProducts ? (
          <Link href="/products/new" className={styles.addButton}>
            <Plus size={19} /> Add Product
          </Link>
        ) : (
          <span className={styles.viewOnlyBadge}>View only</span>
        )}
      </header>

      <section className={styles.content}>
        {parameters.success ? (
          <div className={styles.successMessage}><BadgeCheck size={20} />{parameters.success}</div>
        ) : null}
        {parameters.error ? (
          <div className={styles.errorMessage}><Ban size={20} />{parameters.error}</div>
        ) : null}

        <div className={styles.summaryGrid}>
          <article><div className={styles.summaryIcon}><Boxes size={23} /></div><div><span>Products shown</span><strong>{products.length}</strong></div></article>
          <article><div className={styles.summaryIcon}><BadgeCheck size={23} /></div><div><span>Active products</span><strong>{activeCount}</strong></div></article>
          <article><div className={styles.summaryIcon}><Ban size={23} /></div><div><span>Low / out of stock</span><strong>{lowStockCount}</strong></div></article>
          <article><div className={styles.summaryIcon}><CircleDollarSign size={23} /></div><div><span>Inventory cost value</span><strong className={styles.moneySummary}>{peso(inventoryValue)}</strong></div></article>
        </div>

        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div><p>Product List</p><h2>Inventory items</h2></div>
            <span>{products.length} record{products.length === 1 ? "" : "s"}</span>
          </header>

          <form className={styles.filters}>
            <label className={styles.searchField}>
              <Search size={18} />
              <input name="search" defaultValue={search} placeholder="Search code, barcode, product, category, brand..." />
            </label>
            <select name="status" defaultValue={status}>
              <option value="ALL">All status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <select name="stock" defaultValue={stock}>
              <option value="ALL">All stock</option>
              <option value="AVAILABLE">Above reorder level</option>
              <option value="LOW">Low stock</option>
              <option value="OUT">Out of stock</option>
            </select>
            <button type="submit">Search</button>
            <Link href="/products">Reset</Link>
          </form>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead><tr>
                <th>Code</th><th>Product</th><th>Category / Brand</th><th>Supplier</th>
                <th>Stock</th><th>Cost</th><th>Selling</th><th>Status</th><th>Action</th>
              </tr></thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={9}><div className={styles.emptyState}><PackageSearch size={36} /><strong>No products found</strong><span>Add a product or adjust your search filters.</span></div></td></tr>
                ) : products.map((product) => {
                  const isLow = product.quantity_on_hand <= product.reorder_level;
                  return (
                    <tr key={product.id}>
                      <td><span className={styles.code}>{product.product_code}</span></td>
                      <td>
                        <div className={styles.productCell}>
                          <div className={styles.productIcon}><PackageSearch size={18} /></div>
                          <div><strong>{product.product_name}</strong><span>{product.barcode || "No barcode"}</span></div>
                        </div>
                      </td>
                      <td><div className={styles.metaCell}><strong>{product.category_name || "Uncategorized"}</strong><span><Tags size={13} />{product.brand_name || "No brand"}</span></div></td>
                      <td>{product.supplier_name || <span className={styles.noValue}>—</span>}</td>
                      <td><div className={styles.stockCell}><strong className={isLow ? styles.lowStockText : undefined}>{Number(product.quantity_on_hand).toLocaleString("en-PH")} {product.unit}</strong><span>Reorder: {Number(product.reorder_level).toLocaleString("en-PH")}</span></div></td>
                      <td className={styles.price}>{peso(Number(product.cost_price))}</td>
                      <td className={styles.priceStrong}>{peso(Number(product.selling_price))}</td>
                      <td><span className={product.is_active === 1 ? styles.activeBadge : styles.inactiveBadge}>{product.is_active === 1 ? "Active" : "Inactive"}</span></td>
                      <td>
                        {canManageProducts ? (
                          <div className={styles.rowActions}>
                            <Link href={`/products/${product.id}`} className={styles.editButton}><Edit3 size={15} /> Edit</Link>
                            <form action={toggleProductStatus.bind(null, product.id)}>
                              <button type="submit" className={product.is_active === 1 ? styles.deactivateButton : styles.activateButton}>{product.is_active === 1 ? "Deactivate" : "Activate"}</button>
                            </form>
                          </div>
                        ) : <span className={styles.viewOnlyText}>View only</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
