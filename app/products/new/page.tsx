import type { RowDataPacket } from "mysql2";
import { ArrowLeft, Ban, PackagePlus, Save } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createProduct } from "../actions";
import styles from "../product-form.module.css";

interface OptionRow extends RowDataPacket { id: number; label: string; }
interface NewProductPageProps { searchParams: Promise<{ error?: string }>; }

export default async function NewProductPage({ searchParams }: NewProductPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "INVENTORY") redirect("/products");

  const parameters = await searchParams;
  const [categories] = await pool.query<OptionRow[]>(`SELECT id, category_name AS label FROM product_categories WHERE is_active = 1 ORDER BY category_name`);
  const [brands] = await pool.query<OptionRow[]>(`SELECT id, brand_name AS label FROM product_brands WHERE is_active = 1 ORDER BY brand_name`);
  const [suppliers] = await pool.query<OptionRow[]>(`SELECT id, supplier_name AS label FROM suppliers WHERE is_active = 1 ORDER BY supplier_name`);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <Link href="/products" className={styles.backButton}><ArrowLeft size={19} />Back to Products</Link>
        <div className={styles.titleBlock}>
          <div className={styles.titleIcon}><PackagePlus size={28} /></div>
          <div><p>New Inventory Item</p><h1>Add Product</h1><span>Create a motorcycle part, accessory, oil, or shop inventory item.</span></div>
        </div>
      </header>

      <section className={styles.content}>
        {parameters.error ? <div className={styles.errorMessage}><Ban size={20} />{parameters.error}</div> : null}
        <form action={createProduct} className={styles.formCard}>
          <header><div><p>Product Information</p><h2>Enter product details</h2></div></header>
          <div className={styles.formBody}>
            <div className={styles.twoColumns}>
              <label className={styles.field}><span>Product Name <strong>*</strong></span><input name="product_name" maxLength={180} placeholder="Example: 10W-40 Motorcycle Oil" autoFocus required /><small>Product code will be generated automatically as PRD-000001.</small></label>
              <label className={styles.field}><span>Barcode</span><input name="barcode" maxLength={100} placeholder="Scan or enter barcode" /><small>Optional. If supplied, the barcode must be unique.</small></label>
            </div>

            <div className={styles.threeColumns}>
              <label className={styles.field}><span>Category</span><select name="category_id" defaultValue=""><option value="">No category</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className={styles.field}><span>Brand</span><select name="brand_id" defaultValue=""><option value="">No brand</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label className={styles.field}><span>Supplier</span><select name="supplier_id" defaultValue=""><option value="">No supplier</option>{suppliers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>

            <label className={styles.field}><span>Description</span><textarea name="description" placeholder="Optional product description, compatibility, size, or notes." /></label>

            <div className={styles.fourColumns}>
              <label className={styles.field}><span>Unit <strong>*</strong></span><select name="unit" defaultValue="PCS"><option>PCS</option><option>BOTTLE</option><option>SET</option><option>PAIR</option><option>BOX</option><option>PACK</option><option>LITER</option></select></label>
              <label className={styles.field}><span>Cost Price</span><input type="number" name="cost_price" min="0" step="0.01" defaultValue="0.00" /></label>
              <label className={styles.field}><span>Selling Price</span><input type="number" name="selling_price" min="0" step="0.01" defaultValue="0.00" /></label>
              <label className={styles.field}><span>Reorder Level</span><input type="number" name="reorder_level" min="0" step="0.01" defaultValue="0" /><small>Stock at or below this level will be marked low.</small></label>
            </div>

            <label className={styles.field}><span>Status</span><select name="is_active" defaultValue="1"><option value="1">Active</option><option value="0">Inactive</option></select></label>
            <div className={styles.infoBox}>New products start with <strong>0 stock</strong>. Stock quantity will be controlled from the Inventory / Stock-In module so every movement can be audited.</div>
          </div>
          <footer className={styles.formFooter}><Link href="/products">Cancel</Link><button type="submit"><Save size={19} />Save Product</button></footer>
        </form>
      </section>
    </main>
  );
}
