"use server";

import type { RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { accountForPaymentMethod } from "@/lib/finance";

type SaleRow = RowDataPacket & { id:number; sale_number:string; status:string; total_amount:number; payment_method:string; job_order_id:number|null };
type BatchRow = RowDataPacket & { product_id:number; stock_in_batch_id:number; batch_number:string; quantity:number; unit_cost:number };

function clean(v: FormDataEntryValue | null) { return String(v ?? "").trim(); }

export async function reverseSaleAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "OWNER") redirect("/sales?error=Only%20the%20Owner%20can%20reverse%20a%20sale.");

  const saleId = Number(clean(formData.get("sale_id")));
  const reversalType = clean(formData.get("reversal_type")).toUpperCase();
  const reason = clean(formData.get("reason"));
  if (!Number.isInteger(saleId) || saleId <= 0 || !["VOIDED","REFUNDED"].includes(reversalType)) redirect("/sales?error=Invalid%20sale%20reversal.");
  if (reason.length < 5) redirect("/sales?error=Enter%20a%20clear%20reason%20for%20the%20reversal.");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [sales] = await conn.query<SaleRow[]>(`SELECT id,sale_number,status,total_amount,payment_method,job_order_id FROM sales WHERE id=? LIMIT 1 FOR UPDATE`,[saleId]);
    const sale = sales[0];
    if (!sale) throw new Error("Sale not found.");
    if (sale.status !== "COMPLETED") throw new Error("Only a completed sale can be reversed.");

    if (sale.job_order_id) {
      const [paid] = await conn.query<RowDataPacket[]>(`SELECT id FROM mechanic_earnings WHERE job_order_id=? AND payout_status<>'UNPAID' LIMIT 1 FOR UPDATE`,[sale.job_order_id]);
      if (paid[0]) throw new Error("This Job Order has mechanic earnings that were already included in a payout. Resolve that payout before reversing the sale.");
    }

    const [batches] = await conn.query<BatchRow[]>(`
      SELECT product_id,stock_in_batch_id,batch_number,quantity,unit_cost
      FROM sale_item_batches WHERE sale_id=? ORDER BY id FOR UPDATE`,[saleId]);

    for (const b of batches) {
      await conn.execute(`UPDATE stock_in_batches SET quantity_remaining=quantity_remaining+?, status='ACTIVE' WHERE id=?`,[Number(b.quantity),b.stock_in_batch_id]);
      await conn.execute(`UPDATE products SET quantity_on_hand=quantity_on_hand+?,updated_by=? WHERE id=?`,[Number(b.quantity),user.id,b.product_id]);
      const [balance] = await conn.query<Array<RowDataPacket & {quantity_on_hand:number}>>(`SELECT quantity_on_hand FROM products WHERE id=? LIMIT 1`,[b.product_id]);
      await conn.execute(`INSERT INTO inventory_movements(product_id,movement_type,reference_table,reference_id,quantity_in,quantity_out,balance_after,unit_cost,remarks,created_by) VALUES (?,'ADJUSTMENT_IN','sales',?,?,0,?,?,?,?,?)`,[
        b.product_id,String(saleId),Number(b.quantity),Number(balance[0]?.quantity_on_hand ?? 0),Number(b.unit_cost),`${reversalType} ${sale.sale_number} / Batch ${b.batch_number}: ${reason}`,user.id
      ]);
    }

    await conn.execute(`INSERT INTO money_ledger(entry_date,entry_type,reference_table,reference_id,description,payment_method,account,amount_in,amount_out,processed_by,remarks) VALUES (CURRENT_TIMESTAMP,'SALE','sales',?,?,?,?,0.00,?,?,?)`,[
      `${saleId}-${reversalType}`,`${reversalType} ${sale.sale_number}`,sale.payment_method,accountForPaymentMethod(sale.payment_method),Number(sale.total_amount).toFixed(2),user.id,reason
    ]);

    if (sale.job_order_id) {
      await conn.execute(`DELETE FROM mechanic_earnings WHERE job_order_id=? AND payout_status='UNPAID'`,[sale.job_order_id]);
      await conn.execute(`UPDATE job_order_services SET status='PENDING',completed_at=NULL WHERE job_order_id=? AND status='COMPLETED'`,[sale.job_order_id]);
      const [jr] = await conn.query<Array<RowDataPacket & {status:string}>>(`SELECT status FROM job_orders WHERE id=? LIMIT 1 FOR UPDATE`,[sale.job_order_id]);
      await conn.execute(`UPDATE job_orders SET status='READY_FOR_PAYMENT',paid_at=NULL,date_completed=NULL,released_at=NULL,updated_by=? WHERE id=?`,[user.id,sale.job_order_id]);
      await conn.execute(`INSERT INTO job_order_status_logs(job_order_id,from_status,to_status,remarks,changed_by,changed_by_name) VALUES (?,?,'READY_FOR_PAYMENT',?,?,?)`,[sale.job_order_id,jr[0]?.status ?? 'PAID',`${reversalType} of ${sale.sale_number}: ${reason}`,user.id,user.fullName]);
    }

    await conn.execute(`UPDATE sales SET status=? WHERE id=?`,[reversalType,saleId]);
    await conn.execute(`INSERT INTO activity_logs(user_id,user_name,user_role,action,module,reference_table,reference_id) VALUES (?,?,?,?,'Sales','sales',?)`,[user.id,user.fullName,user.role,`${reversalType} sale ${sale.sale_number}. Reason: ${reason}`,String(saleId)]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    const msg = e instanceof Error ? e.message : "Unable to reverse sale.";
    redirect(`/sales?error=${encodeURIComponent(msg)}`);
  } finally { conn.release(); }

  revalidatePath("/sales"); revalidatePath("/money-ledger"); revalidatePath("/inventory/stock-inquiry"); revalidatePath("/job-orders");
  redirect(`/sales?success=${encodeURIComponent(`Sale ${reversalType.toLowerCase()} and inventory/cash records reversed successfully.`)}`);
}
