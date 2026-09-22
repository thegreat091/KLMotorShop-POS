"use server";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

type ImportLine = { productId:number; countedQty:number; qrLabels:number };
interface ProductRow extends RowDataPacket { id:number; product_code:string; product_name:string; barcode:string|null; quantity_on_hand:number; cost_price:number; selling_price:number; supplier_id:number|null; }

async function requireInventoryManager(){ const user=await getCurrentUser(); if(!user) redirect("/"); if(!["ADMIN","INVENTORY"].includes(user.role)) redirect("/dashboard"); return user; }
function ymd(d=new Date()){return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`}
function fail(message:string):never{redirect(`/inventory/initial-inventory?error=${encodeURIComponent(message)}`)}

export async function saveInitialInventory(formData:FormData){
  const user=await requireInventoryManager();
  const raw=String(formData.get("lines")||"");
  let lines:ImportLine[]=[];
  try{ lines=JSON.parse(raw) as ImportLine[]; }catch{ fail("The uploaded inventory data is invalid. Please upload the Excel file again."); }
  if(!Array.isArray(lines)||lines.length===0) fail("No counted quantities were found to import.");
  const ids=lines.map(x=>Number(x.productId));
  if(new Set(ids).size!==ids.length) fail("Duplicate products were found in the import.");
  for(const line of lines){
    if(!Number.isInteger(line.productId)||line.productId<=0) fail("Invalid product in import.");
    if(!Number.isInteger(line.countedQty)||line.countedQty<0) fail("Counted Qty must be a whole number zero or greater.");
    if(!Number.isInteger(line.qrLabels)||line.qrLabels<0) fail("QR Labels must be a whole number zero or greater.");
  }

  const connection=await pool.getConnection(); let transactionId=0;
  try{
    await connection.beginTransaction();
    await connection.execute(`CREATE TABLE IF NOT EXISTS initial_inventory_labels (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, stock_transaction_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL, label_count INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_initial_inventory_label (stock_transaction_id, product_id), KEY idx_initial_inventory_product (product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const placeholders=ids.map(()=>"?").join(",");
    const [products]=await connection.query<ProductRow[]>(`SELECT id,product_code,product_name,barcode,quantity_on_hand,cost_price,selling_price,supplier_id FROM products WHERE id IN (${placeholders}) AND is_active=1 FOR UPDATE`,ids);
    if(products.length!==ids.length) throw new Error("One or more products no longer exist or are inactive.");

    // Validate everything before writing anything.
    for(const line of lines){
      const p=products.find(x=>x.id===line.productId)!;
      const current=Number(p.quantity_on_hand||0);
      if(line.countedQty<current) throw new Error(`${p.product_name}: Counted Qty (${line.countedQty}) is below current stock (${current}). Use Stock Adjustment for stock reductions.`);
    }
    const changed=lines.filter(line=>{const p=products.find(x=>x.id===line.productId)!; return line.countedQty>Number(p.quantity_on_hand||0);});
    const labelsRequested=lines.some(x=>x.qrLabels>0);
    if(changed.length===0 && !labelsRequested) throw new Error("Nothing to import or print. Enter a Counted Qty or QR Labels value.");

    const temp=`TMP-OPEN-${Date.now()}`;
    const [header]=await connection.execute<ResultSetHeader>(`INSERT INTO stock_transactions (reference_number,transaction_type,supplier_id,transaction_date,remarks,created_by) VALUES (?,'STOCK_IN',NULL,NOW(),'INITIAL INVENTORY / PHYSICAL COUNT',?)`,[temp,user.id]);
    transactionId=header.insertId;
    const ref=`OPEN-${ymd()}-${String(transactionId).padStart(5,"0")}`;
    await connection.execute(`UPDATE stock_transactions SET reference_number=? WHERE id=?`,[ref,transactionId]);

    let lineNo=0;
    for(const line of lines){
      const p=products.find(x=>x.id===line.productId)!;
      const current=Number(p.quantity_on_hand||0); const add=line.countedQty-current;
      let productBarcode=(p.barcode||"").trim();
      if(!productBarcode){ productBarcode=`KLP${String(p.id).padStart(8,"0")}`; await connection.execute(`UPDATE products SET barcode=?,updated_by=? WHERE id=?`,[productBarcode,user.id,p.id]); }
      if(line.qrLabels>0) await connection.execute(`INSERT INTO initial_inventory_labels (stock_transaction_id,product_id,label_count) VALUES (?,?,?)`,[transactionId,p.id,line.qrLabels]);
      if(add<=0) continue;
      lineNo++;
      const [item]=await connection.execute<ResultSetHeader>(`INSERT INTO stock_transaction_items (stock_transaction_id,product_id,quantity,unit_cost,subtotal) VALUES (?,?,?,?,?)`,[transactionId,p.id,add,Number(p.cost_price||0),add*Number(p.cost_price||0)]);
      const batch=`OPEN-${ymd()}-${String(transactionId).padStart(5,"0")}-${String(lineNo).padStart(2,"0")}`;
      const batchBarcode=`KLB${ymd().slice(2)}${String(transactionId).padStart(5,"0")}${String(lineNo).padStart(2,"0")}`;
      await connection.execute(`INSERT INTO stock_in_batches (stock_transaction_id,stock_transaction_item_id,product_id,supplier_id,batch_number,barcode,quantity_received,quantity_remaining,unit_cost,selling_price,received_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),'ACTIVE')`,[transactionId,item.insertId,p.id,p.supplier_id,batch,batchBarcode,add,add,Number(p.cost_price||0),Number(p.selling_price||0)]);
      await connection.execute(`UPDATE products SET quantity_on_hand=?,updated_by=? WHERE id=?`,[line.countedQty,user.id,p.id]);
      await connection.execute(`INSERT INTO inventory_movements (product_id,movement_type,reference_table,reference_id,quantity_in,quantity_out,balance_after,unit_cost,remarks,created_by) VALUES (?,'STOCK_IN','stock_transactions',?,?,0,?,?,?,?)`,[p.id,String(transactionId),add,line.countedQty,Number(p.cost_price||0),`Initial inventory / physical count ${ref}`,user.id]);
    }
    await connection.execute(`INSERT INTO activity_logs (user_id,user_name,user_role,action,module,reference_table,reference_id) VALUES (?,?,?,?,?,?,?)`,[user.id,user.fullName,user.role,`Imported initial inventory ${ref}`,"Initial Inventory","stock_transactions",String(transactionId)]);
    await connection.commit();
  }catch(error){await connection.rollback(); console.error("Initial inventory import error:",error); const msg=error instanceof Error?error.message:"Unable to import initial inventory."; fail(msg);}finally{connection.release();}
  revalidatePath("/products"); revalidatePath("/inventory/stock-in"); revalidatePath("/inventory-dashboard"); revalidatePath("/dashboard");
  redirect(`/inventory/initial-inventory/labels?transaction=${transactionId}`);
}
