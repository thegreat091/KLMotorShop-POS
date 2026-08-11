"use server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { accountForPaymentMethod } from "@/lib/finance";
function clean(v:FormDataEntryValue|null){return String(v??"").trim()}
export async function createCapitalInjectionAction(formData:FormData){
 const user=await getCurrentUser();if(!user)redirect("/");if(user.role!=="OWNER"&&user.role!=="ADMIN")redirect("/dashboard");
 const amount=Number(clean(formData.get("amount")));const method=clean(formData.get("payment_method"));const remarks=clean(formData.get("remarks"));
 if(!Number.isFinite(amount)||amount<=0)redirect("/capital-injections?error=Amount%20must%20be%20greater%20than%20zero.");
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();const [nr]=await conn.query<RowDataPacket[]>("SELECT COALESCE(MAX(id),0)+1 next_no FROM capital_injections");const no=`CAP-${String(nr[0]?.next_no??1).padStart(5,"0")}`;
 const [res]=await conn.execute<ResultSetHeader>("INSERT INTO capital_injections(reference_number,injection_date,amount,payment_method,remarks,created_by) VALUES (?,CURRENT_TIMESTAMP,?,?,?,?,?)",[no,amount.toFixed(2),method,remarks||null,user.id]);
 await conn.execute("INSERT INTO money_ledger(entry_date,entry_type,reference_table,reference_id,description,payment_method,account,amount_in,amount_out,processed_by,remarks) VALUES (CURRENT_TIMESTAMP,'CAPITAL_INJECTION','capital_injections',?,?,?,?,?,0.00,?,?)",[String(res.insertId),`Capital Injection ${no}`,method,accountForPaymentMethod(method),amount.toFixed(2),user.id,remarks||null]);
 await conn.commit();
 }catch(e){await conn.rollback();redirect(`/capital-injections?error=${encodeURIComponent(e instanceof Error?e.message:"Unable to save.")}`)}finally{conn.release()}
 revalidatePath("/capital-injections");revalidatePath("/money-ledger");redirect("/capital-injections?success=Capital%20injection%20recorded.");
}
