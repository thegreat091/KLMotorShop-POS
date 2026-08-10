import type { RowDataPacket } from "mysql2";
import { ArrowLeft, PackagePlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import StockInForm from "../stock-in-form";
import styles from "../stock-in.module.css";

interface ProductRow extends RowDataPacket { id: number; product_code: string; product_name: string; cost_price: number; selling_price: number; unit: string; }
interface SupplierRow extends RowDataPacket { id: number; supplier_name: string; }

export default async function NewStockInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "INVENTORY") redirect("/dashboard");
  const parameters = await searchParams;
  const [products] = await pool.query<ProductRow[]>(`SELECT id, product_code, product_name, cost_price, selling_price, unit FROM products WHERE is_active = 1 ORDER BY product_name`);
  const [suppliers] = await pool.query<SupplierRow[]>(`SELECT id, supplier_name FROM suppliers WHERE is_active = 1 ORDER BY supplier_name`);

  return <main className={styles.page}>
    <header className={styles.hero}><div><Link href="/inventory/stock-in" className={styles.backButton}><ArrowLeft size={19} /> Stock In</Link><div className={styles.titleBlock}><div className={styles.titleIcon}><PackagePlus size={28} /></div><div><p>Inventory</p><h1>New Stock In</h1><span>Receive products, create batches, and generate barcode stickers.</span></div></div></div></header>
    <section className={styles.content}>{parameters.error ? <div className={styles.errorMessage}>{parameters.error}</div> : null}<StockInForm products={products.map((row) => ({ ...row }))} suppliers={suppliers.map((row) => ({ ...row }))} /></section>
  </main>;
}
