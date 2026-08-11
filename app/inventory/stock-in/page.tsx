import type { RowDataPacket } from "mysql2";
import { ArrowLeft, PackagePlus, Search, Truck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./stock-in.module.css";

interface StockInRow extends RowDataPacket { id: number; reference_number: string; transaction_date: Date; supplier_name: string | null; supplier_reference: string | null; total_lines: number; total_quantity: number; total_cost: number; }

function peso(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value); }

export default async function StockInPage({ searchParams }: { searchParams: Promise<{ search?: string; success?: string; error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "INVENTORY", "OWNER"].includes(user.role)) redirect("/dashboard");
  const canCreate = user.role === "ADMIN" || user.role === "INVENTORY";
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const [rows] = await pool.query<StockInRow[]>(`
    SELECT st.id, st.reference_number, st.transaction_date, s.supplier_name,
      sim.supplier_reference, COUNT(sti.id) total_lines,
      COALESCE(SUM(sti.quantity),0) total_quantity, COALESCE(SUM(sti.subtotal),0) total_cost
    FROM stock_transactions st
    LEFT JOIN suppliers s ON s.id = st.supplier_id
    LEFT JOIN stock_in_meta sim ON sim.stock_transaction_id = st.id
    LEFT JOIN stock_transaction_items sti ON sti.stock_transaction_id = st.id
    WHERE st.transaction_type='STOCK_IN'
      AND (? = '' OR CONVERT(st.reference_number USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(s.supplier_name USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci OR CONVERT(sim.supplier_reference USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci)
    GROUP BY st.id, st.reference_number, st.transaction_date, s.supplier_name, sim.supplier_reference
    ORDER BY st.transaction_date DESC, st.id DESC
  `, [search, `%${search}%`, `%${search}%`, `%${search}%`]);

  return <main className={styles.page}>
    <header className={styles.hero}><div><Link href="/dashboard" className={styles.backButton}><ArrowLeft size={19}/> Dashboard</Link><div className={styles.titleBlock}><div className={styles.titleIcon}><Truck size={28}/></div><div><p>Inventory</p><h1>Stock In</h1><span>Receive supplier deliveries and print batch barcode labels.</span></div></div></div>{canCreate ? <Link href="/inventory/stock-in/new" className={styles.addButton}><PackagePlus size={19}/> New Stock In</Link> : null}</header>
    <section className={styles.content}>
      {params.success ? <div className={styles.successMessage}>{params.success}</div> : null}{params.error ? <div className={styles.errorMessage}>{params.error}</div> : null}
      <section className={styles.panel}><header className={styles.panelHeader}><div><p>History</p><h2>Received inventory</h2></div><span>{rows.length} transaction{rows.length===1?"":"s"}</span></header>
        <form className={styles.filters}><label><Search size={18}/><input name="search" defaultValue={search} placeholder="Search stock-in #, supplier, invoice..."/></label><button type="submit">Search</button><Link href="/inventory/stock-in">Reset</Link></form>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Stock-In #</th><th>Date</th><th>Supplier</th><th>Supplier Ref.</th><th>Lines</th><th>Qty</th><th>Total Cost</th><th></th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={8}><div className={styles.empty}>No stock-in transactions yet.</div></td></tr>:rows.map((row)=><tr key={row.id}><td><strong>{row.reference_number}</strong></td><td>{new Date(row.transaction_date).toLocaleString("en-PH")}</td><td>{row.supplier_name ?? "—"}</td><td>{row.supplier_reference ?? "—"}</td><td>{Number(row.total_lines)}</td><td>{Number(row.total_quantity).toLocaleString("en-PH")}</td><td><strong>{peso(Number(row.total_cost))}</strong></td><td><Link className={styles.viewButton} href={`/inventory/stock-in/${row.id}`}>View</Link></td></tr>)}</tbody></table></div>
      </section>
    </section>
  </main>;
}
