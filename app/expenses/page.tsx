import type { RowDataPacket } from "mysql2";
import { ArrowLeft, CircleDollarSign, PlusCircle, ReceiptText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { createExpenseAction } from "./actions";
import styles from "./expenses.module.css";

interface CategoryRow extends RowDataPacket {id:number;category_name:string;requires_description:number}
interface ExpenseRow extends RowDataPacket {
  id:number;expense_number:string;expense_date:Date|string;category_name:string;other_description:string|null;
  payee:string|null;payment_method:string;amount:number;reference_number:string|null;cashier_name:string|null;remarks:string|null
}
type Params={from?:string;to?:string;category?:string;method?:string;q?:string;success?:string;error?:string};

function money(v:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));}
function ds(d:Date){const p=(n:number)=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}

export default async function ExpensesPage({searchParams}:{searchParams:Promise<Params>}){
  const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","CASHIER"].includes(user.role))redirect("/dashboard");
  const p=await searchParams;const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
  const from=p.from||ds(first),to=p.to||ds(now),category=p.category||"",method=p.method||"",q=(p.q||"").trim(),like=`%${q}%`;

  const [categories]=await pool.query<CategoryRow[]>("SELECT id,category_name,requires_description FROM expense_categories WHERE is_active=1 ORDER BY category_name");
  const [rows]=await pool.execute<ExpenseRow[]>(
    `SELECT e.id,e.expense_number,e.expense_date,ec.category_name,e.other_description,e.payee,e.payment_method,e.amount,e.reference_number,u.full_name cashier_name,e.remarks
     FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id LEFT JOIN users u ON u.id=e.created_by
     WHERE DATE(e.expense_date)>=? AND DATE(e.expense_date)<=?
       AND (?='' OR CAST(e.category_id AS CHAR)=?)
       AND (?='' OR e.payment_method=?)
       AND (?='' OR e.expense_number LIKE ? OR COALESCE(e.payee,'') LIKE ? OR COALESCE(e.other_description,'') LIKE ?)
     ORDER BY e.expense_date DESC,e.id DESC`,
    [from,to,category,category,method,method,q,like,like,like],
  );
  const total=rows.reduce((a,r)=>a+Number(r.amount),0);
  const canCreate=["ADMIN","CASHIER"].includes(user.role);

  return <main className={styles.page}>
    <div className={styles.topbar}><Link href="/dashboard"><ArrowLeft size={17}/>Dashboard</Link><Link href="/money-ledger"><CircleDollarSign size={17}/>Money Ledger</Link></div>
    <section className={styles.hero}><div><span>Finance</span><h1>Expenses</h1><p>Record operating expenses and automatically post Money Out to the ledger.</p></div><ReceiptText size={46}/></section>
    {p.success?<div className={styles.success}>{p.success}</div>:null}{p.error?<div className={styles.error}>{p.error}</div>:null}
    {canCreate?<section className={styles.card}><header><PlusCircle size={20}/><div><h2>New Expense</h2><p>Cashier entry</p></div></header>
      <form action={createExpenseAction} className={styles.form}>
        <label>Category<select name="category_id" required><option value="">Select category...</option>{categories.map(c=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select></label>
        <label>Specify if Others<input name="other_description" placeholder='Required only when "Others" is selected'/></label>
        <label>Payee / Supplier<input name="payee" placeholder="Optional"/></label>
        <label>Payment Method<select name="payment_method" defaultValue="CASH"><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
        <label>Amount<input type="number" name="amount" min="0.01" step="0.01" required/></label>
        <label>Reference No.<input name="reference_number" placeholder="Optional"/></label>
        <label className={styles.full}>Remarks<textarea name="remarks" rows={2}/></label>
        <button type="submit">Save Expense</button>
      </form>
    </section>:null}
    <section className={styles.metrics}><article><span>Total Expenses</span><strong>{money(total)}</strong></article><article><span>Transactions</span><strong>{rows.length}</strong></article></section>
    <form className={styles.filters}><input type="date" name="from" defaultValue={from}/><input type="date" name="to" defaultValue={to}/><select name="category" defaultValue={category}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select><select name="method" defaultValue={method}><option value="">All methods</option><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank Transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select><input name="q" defaultValue={q} placeholder="Expense no., payee, details..."/><button>Apply</button></form>
    <section className={styles.card}><div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Expense No.</th><th>Category</th><th>Payee</th><th>Method</th><th>Reference</th><th>Cashier</th><th>Amount</th></tr></thead><tbody>
      {rows.map(r=><tr key={r.id}><td>{new Date(r.expense_date).toLocaleString("en-PH")}</td><td><strong>{r.expense_number}</strong></td><td>{r.category_name}{r.other_description?` - ${r.other_description}`:""}</td><td>{r.payee||"—"}</td><td>{r.payment_method.replaceAll("_"," ")}</td><td>{r.reference_number||"—"}</td><td>{r.cashier_name||"—"}</td><td><strong>{money(r.amount)}</strong></td></tr>)}
      {!rows.length?<tr><td colSpan={8} className={styles.empty}>No expenses found.</td></tr>:null}
    </tbody></table></div></section>
  </main>
}
