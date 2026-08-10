import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Ban, Edit3, Save } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { updateProduct } from "../actions";
import styles from "../product-form.module.css";

interface ProductRow extends RowDataPacket {
  id: number; product_code: string; barcode: string | null; product_name: string;
  category_id: number | null; brand_id: number | null; supplier_id: number | null;
  description: string | null; unit: string; cost_price: number; selling_price: number;
  quantity_on_hand: number; reorder_level: number; is_active: number;
}
interface OptionRow extends RowDataPacket { id: number; label: string; }
interface EditProductPageProps { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }>; }

export default async function EditProductPage({ params, searchParams }: EditProductPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "INVENTORY") redirect("/products");

  const routeParameters = await params;
  const queryParameters = await searchParams;
  const productId = Number(routeParameters.id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const [products] = await pool.execute<ProductRow[]>(`SELECT id, product_code, barcode, product_name, category_id, brand_id, supplier_id, description, unit, cost_price, selling_price, quantity_on_hand, reorder_level, is_active FROM products WHERE id = ? LIMIT 1`, [productId]);
  const product = products[0];
  if (!product) notFound();

  const [categories] = await pool.query<OptionRow[]>(`SELECT id, category_name AS label FROM product_categories WHERE is_active = 1 OR id = ? ORDER BY category_name`, [product.category_id ?? 0]);
  const [brands] = await pool.query<OptionRow[]>(`SELECT id, brand_name AS label FROM product_brands WHERE is_active = 1 OR id = ? ORDER BY brand_name`, [product.brand_id ?? 0]);
  const [suppliers] = await pool.query<OptionRow[]>(`SELECT id, supplier_name AS label FROM suppliers WHERE is_active = 1 OR id = ? ORDER BY supplier_name`, [product.supplier_id ?? 0]);
  const updateAction = updateProduct.bind(null, product.id);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/products" className={styles.backButton}><ArrowLeft size={19} />Back to Products</Link>
        <div className={styles.titleBlock}><div className={styles.titleIcon}><Edit3 size={28} /></div><div><p>{product.product_code}</p><h1>Edit Product</h1><span>Update product master data, prices, reorder level, and status.</span></div></div>
      </header>

      <section className={styles.content}>
        {queryParameters.error ? <div className={styles.errorMessage}><Ban size={20} />{queryParameters.error}</div> : null}
        <form action={updateAction} className={styles.formCard}>
          <header><div><p>Product Information</p><h2>{product.product_name}</h2></div><span className={styles.codeBadge}>{product.product_code}</span></header>
          <div className={styles.formBody}>
            <div className={styles.twoColumns}>
              <label className={styles.field}><span>Product Name <strong>*</strong></span><input name="product_name" maxLength={180} defaultValue={product.product_name} required /></label>
              <label className={styles.field}><span>Barcode</span><input name="barcode" maxLength={100} defaultValue={product.barcode ?? ""} /></label>
            </div>

            <div className={styles.threeColumns}>
              <label className={styles.field}><span>Category</span><select name="category_id" defaultValue={product.category_id ? String(product.category_id) : ""}><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className={styles.field}><span>Brand</span><select name="brand_id" defaultValue={product.brand_id ? String(product.brand_id) : ""}><option value="">No brand</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className={styles.field}><span>Supplier</span><select name="supplier_id" defaultValue={product.supplier_id ? String(product.supplier_id) : ""}><option value="">No supplier</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>

            <label className={styles.field}><span>Description</span><textarea name="description" defaultValue={product.description ?? ""} /></label>

            <div className={styles.fourColumns}>
              <label className={styles.field}><span>Unit <strong>*</strong></span><select name="unit" defaultValue={product.unit}><option>PCS</option><option>BOTTLE</option><option>SET</option><option>PAIR</option><option>BOX</option><option>PACK</option><option>LITER</option></select></label>
              <label className={styles.field}><span>Cost Price</span><input type="number" name="cost_price" min="0" step="0.01" defaultValue={Number(product.cost_price).toFixed(2)} /></label>
              <label className={styles.field}><span>Selling Price</span><input type="number" name="selling_price" min="0" step="0.01" defaultValue={Number(product.selling_price).toFixed(2)} /></label>
              <label className={styles.field}><span>Reorder Level</span><input type="number" name="reorder_level" min="0" step="0.01" defaultValue={Number(product.reorder_level)} /></label>
            </div>

            <div className={styles.twoColumns}>
              <label className={styles.field}><span>Current Stock</span><input value={`${Number(product.quantity_on_hand).toLocaleString("en-PH")} ${product.unit}`} readOnly /><small>Stock quantity is changed only through inventory transactions.</small></label>
              <label className={styles.field}><span>Status</span><select name="is_active" defaultValue={String(product.is_active)}><option value="1">Active</option><option value="0">Inactive</option></select></label>
            </div>
          </div>
          <footer className={styles.formFooter}><Link href="/products">Cancel</Link><button type="submit"><Save size={19} />Save Changes</button></footer>
        </form>
      </section>
    </main>
  );
}
