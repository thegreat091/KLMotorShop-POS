"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface NextNumberRow extends RowDataPacket { next_number: number; }
interface JobRow extends RowDataPacket { id: number; status: string; assigned_mechanic_id: number | null; }
interface ServiceRow extends RowDataPacket {
  id: number; service_name: string; service_charge: number;
  owner_percentage: number; mechanic_percentage: number;
}
interface ProductRow extends RowDataPacket { id: number; product_name: string; selling_price: number; quantity_on_hand: number; }

const allowedStatuses = new Set([
  "RECEIVED", "INSPECTION", "WAITING_PARTS", "REPAIRING",
  "READY_FOR_PAYMENT", "PAID", "COMPLETED", "RELEASED", "CANCELLED",
]);

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function numberValue(fd: FormData, key: string) {
  const value = Number(text(fd, key));
  return Number.isFinite(value) ? value : 0;
}
function url(path: string, type: "success" | "error", message: string) {
  return `${path}?${type}=${encodeURIComponent(message)}`;
}
async function requireJobOrderUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "CASHIER", "OWNER"].includes(user.role)) redirect("/dashboard");
  return user;
}
async function requireJobOrderEditor() {
  const user = await requireJobOrderUser();
  if (!["ADMIN", "CASHIER"].includes(user.role)) redirect("/job-orders");
  return user;
}
async function nextJobOrderNumber() {
  const [rows] = await pool.query<NextNumberRow[]>(`
    SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(job_order_number, '-', -1) AS UNSIGNED)),0)+1 next_number
    FROM job_orders
    WHERE job_order_number LIKE 'JO-%'
  `);
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}`;
  return `JO-${stamp}-${String(Number(rows[0]?.next_number ?? 1)).padStart(5,"0")}`;
}
async function logActivity(user: { id: number; fullName: string; role: string }, action: string, id: number) {
  await pool.execute(`INSERT INTO activity_logs
    (user_id,user_name,user_role,action,module,reference_table,reference_id)
    VALUES (?,?,?,?,?,?,?)`, [user.id,user.fullName,user.role,action,"Job Orders","job_orders",String(id)]);
}

export async function createJobOrder(fd: FormData) {
  const user = await requireJobOrderEditor();
  const clientId = numberValue(fd,"client_id");
  const motorcycleId = numberValue(fd,"motorcycle_id");
  const mechanicId = numberValue(fd,"assigned_mechanic_id") || null;
  const concern = text(fd,"customer_concern");
  const priority = text(fd,"priority") || "NORMAL";
  const estimatedFinish = text(fd,"estimated_finish") || null;
  const remarks = text(fd,"remarks") || null;

  if (!clientId || !motorcycleId || !concern) redirect(url("/job-orders/new","error","Client, motorcycle, and customer concern are required."));
  if (!["LOW","NORMAL","HIGH","EMERGENCY"].includes(priority)) redirect(url("/job-orders/new","error","Invalid priority."));

  const [motorcycleRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM motorcycles WHERE id=? AND client_id=? AND is_active=1 LIMIT 1`,
    [motorcycleId, clientId],
  );

  if (motorcycleRows.length === 0) {
    redirect(url(
      "/job-orders/new",
      "error",
      "The selected motorcycle does not belong to the selected client.",
    ));
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const joNumber = await nextJobOrderNumber();
    const [result] = await connection.execute<ResultSetHeader>(`
      INSERT INTO job_orders
      (job_order_number,client_id,motorcycle_id,status,priority,assigned_mechanic_id,estimated_finish,customer_concern,remarks,created_by,updated_by)
      VALUES (?,?,?,'RECEIVED',?,?,?,?,?,?,?)
    `,[joNumber,clientId,motorcycleId,priority,mechanicId,estimatedFinish,concern,remarks,user.id,user.id]);
    const id = result.insertId;
    await connection.execute(`INSERT INTO job_order_status_logs
      (job_order_id,from_status,to_status,remarks,changed_by,changed_by_name)
      VALUES (?,NULL,'RECEIVED','Job order created.',?,?)`,[id,user.id,user.fullName]);
    await connection.commit();
    await logActivity(user,`Created job order ${joNumber}.`,id);
    revalidatePath("/job-orders");
    redirect(`/job-orders/${id}/print?autoprint=1`);
  } catch (error) {
    await connection.rollback();
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    console.error(error);
    redirect(url("/job-orders/new","error",error instanceof Error ? error.message : "Unable to create job order."));
  } finally { connection.release(); }
}

export async function updateJobOrderDetails(fd: FormData) {
  const user = await requireJobOrderEditor();
  const id = numberValue(fd,"job_order_id");
  const mechanicId = numberValue(fd,"assigned_mechanic_id") || null;
  const priority = text(fd,"priority") || "NORMAL";
  const estimatedFinish = text(fd,"estimated_finish") || null;
  const diagnosis = text(fd,"diagnosis") || null;
  const remarks = text(fd,"remarks") || null;
  if (!id) redirect("/job-orders");
  await pool.execute(`UPDATE job_orders SET assigned_mechanic_id=?,priority=?,estimated_finish=?,diagnosis=?,remarks=?,updated_by=? WHERE id=?`,
    [mechanicId,priority,estimatedFinish,diagnosis,remarks,user.id,id]);
  await logActivity(user,"Updated job order details.",id);
  revalidatePath(`/job-orders/${id}`);
  redirect(url(`/job-orders/${id}`,"success","Job order details updated."));
}

export async function addJobOrderService(fd: FormData) {
  const user = await requireJobOrderEditor();
  const jobOrderId = numberValue(fd,"job_order_id");
  const serviceId = numberValue(fd,"service_id");
  const mechanicIdForm = numberValue(fd,"mechanic_id") || null;
  if (!jobOrderId || !serviceId) redirect("/job-orders");

  const [jobs] = await pool.execute<JobRow[]>(`SELECT id,status,assigned_mechanic_id FROM job_orders WHERE id=? LIMIT 1`,[jobOrderId]);
  if (!jobs[0] || ["PAID","COMPLETED","RELEASED","CANCELLED"].includes(jobs[0].status)) redirect(url(`/job-orders/${jobOrderId}`,"error","This job order can no longer be edited."));
  const [services] = await pool.execute<ServiceRow[]>(`SELECT id,service_name,service_charge,owner_percentage,mechanic_percentage FROM services WHERE id=? AND is_active=1 LIMIT 1`,[serviceId]);
  const service = services[0];
  if (!service) redirect(url(`/job-orders/${jobOrderId}`,"error","Service not found."));
  const mechanicId = mechanicIdForm || jobs[0].assigned_mechanic_id;
  const charge = Number(service.service_charge);
  const ownerPct = Number(service.owner_percentage);
  const mechanicPct = Number(service.mechanic_percentage);
  await pool.execute(`INSERT INTO job_order_services
    (job_order_id,service_id,mechanic_id,service_name,service_charge,owner_percentage,mechanic_percentage,owner_share,mechanic_share,status)
    VALUES (?,?,?,?,?,?,?,?,?,'PENDING')`,
    [jobOrderId,service.id,mechanicId,service.service_name,charge,ownerPct,mechanicPct,charge*ownerPct/100,charge*mechanicPct/100]);
  await logActivity(user,`Added service ${service.service_name}.`,jobOrderId);
  revalidatePath(`/job-orders/${jobOrderId}`);
  redirect(url(`/job-orders/${jobOrderId}`,"success","Service added."));
}

export async function addJobOrderPartByBarcode(fd: FormData) {
  const user = await requireJobOrderEditor();
  const jobOrderId = numberValue(fd,"job_order_id");
  const barcode = text(fd,"barcode");

  if (!jobOrderId || !barcode) {
    redirect(url(`/job-orders/${jobOrderId}`,"error","Scan or enter a barcode first."));
  }

  const [jobs] = await pool.execute<JobRow[]>(
    `SELECT id,status,assigned_mechanic_id FROM job_orders WHERE id=? LIMIT 1`,
    [jobOrderId],
  );
  if (!jobs[0] || ["PAID","COMPLETED","RELEASED","CANCELLED"].includes(jobs[0].status)) {
    redirect(url(`/job-orders/${jobOrderId}`,"error","This job order can no longer be edited."));
  }

  // Prefer a KL stock-in batch barcode. The batch must still have stock.
  const [batchProducts] = await pool.execute<(ProductRow & RowDataPacket)[]>(`
    SELECT p.id,p.product_name,p.selling_price,p.quantity_on_hand
    FROM stock_in_batches b
    INNER JOIN products p ON p.id=b.product_id
    WHERE CONVERT(b.barcode USING utf8mb4)=CONVERT(? USING utf8mb4)
      AND b.status='ACTIVE'
      AND b.quantity_remaining>0
      AND p.is_active=1
    LIMIT 1
  `,[barcode]);

  let product = batchProducts[0];

  // Otherwise try the manufacturer's / product barcode.
  if (!product) {
    const [productRows] = await pool.execute<(ProductRow & RowDataPacket)[]>(`
      SELECT id,product_name,selling_price,quantity_on_hand
      FROM products
      WHERE CONVERT(barcode USING utf8mb4)=CONVERT(? USING utf8mb4)
        AND is_active=1
      LIMIT 1
    `,[barcode]);
    product = productRows[0];
  }

  if (!product) {
    redirect(url(`/job-orders/${jobOrderId}`,"error",`Barcode ${barcode} was not found or has no available stock.`));
  }

  const availableStock = Number(product.quantity_on_hand);
  if (availableStock <= 0) {
    redirect(url(`/job-orders/${jobOrderId}`,"error",`${product.product_name} is out of stock.`));
  }

  const [existingRows] = await pool.execute<(RowDataPacket & { id:number; quantity:number })[]>(`
    SELECT id,quantity
    FROM job_order_parts
    WHERE job_order_id=? AND product_id=?
    ORDER BY id
    LIMIT 1
  `,[jobOrderId,product.id]);

  const existing = existingRows[0];
  const newQuantity = Number(existing?.quantity ?? 0) + 1;
  if (newQuantity > availableStock) {
    redirect(url(`/job-orders/${jobOrderId}`,"error",`Only ${availableStock} item(s) of ${product.product_name} are currently in stock.`));
  }

  const price = Number(product.selling_price);
  if (existing) {
    await pool.execute(`
      UPDATE job_order_parts
      SET quantity=?, unit_price=?, line_total=?
      WHERE id=? AND job_order_id=?
    `,[newQuantity,price,newQuantity*price,existing.id,jobOrderId]);
  } else {
    await pool.execute(`
      INSERT INTO job_order_parts
      (job_order_id,product_id,product_name,quantity,unit_price,line_total)
      VALUES (?,?,?,?,?,?)
    `,[jobOrderId,product.id,product.product_name,1,price,price]);
  }

  await logActivity(user,`Scanned part ${product.product_name} (${barcode}).`,jobOrderId);
  revalidatePath(`/job-orders/${jobOrderId}`);
  redirect(url(`/job-orders/${jobOrderId}`,"success",`${product.product_name} added by barcode scan.`));
}

export async function addJobOrderPart(fd: FormData) {
  const user = await requireJobOrderEditor();
  const jobOrderId = numberValue(fd,"job_order_id");
  const productId = numberValue(fd,"product_id");
  const quantity = numberValue(fd,"quantity");
  if (!jobOrderId || !productId || quantity <= 0) redirect(url(`/job-orders/${jobOrderId}`,"error","Select a product and enter a valid quantity."));
  const [jobs] = await pool.execute<JobRow[]>(`SELECT id,status,assigned_mechanic_id FROM job_orders WHERE id=? LIMIT 1`,[jobOrderId]);
  if (!jobs[0] || ["PAID","COMPLETED","RELEASED","CANCELLED"].includes(jobs[0].status)) redirect(url(`/job-orders/${jobOrderId}`,"error","This job order can no longer be edited."));
  const [products] = await pool.execute<ProductRow[]>(`SELECT id,product_name,selling_price,quantity_on_hand FROM products WHERE id=? AND is_active=1 LIMIT 1`,[productId]);
  const product = products[0];
  if (!product) redirect(url(`/job-orders/${jobOrderId}`,"error","Product not found."));
  if (quantity > Number(product.quantity_on_hand)) redirect(url(`/job-orders/${jobOrderId}`,"error",`Only ${Number(product.quantity_on_hand)} item(s) are currently in stock.`));
  const price = Number(product.selling_price);
  await pool.execute(`INSERT INTO job_order_parts (job_order_id,product_id,product_name,quantity,unit_price,line_total) VALUES (?,?,?,?,?,?)`,
    [jobOrderId,product.id,product.product_name,quantity,price,quantity*price]);
  await logActivity(user,`Added part ${product.product_name} x ${quantity}.`,jobOrderId);
  revalidatePath(`/job-orders/${jobOrderId}`);
  redirect(url(`/job-orders/${jobOrderId}`,"success","Part added. Inventory will be deducted only after payment."));
}

export async function removeJobOrderPart(fd: FormData) {
  const user = await requireJobOrderEditor();
  const id = numberValue(fd,"part_id");
  const jobOrderId = numberValue(fd,"job_order_id");
  await pool.execute(`DELETE FROM job_order_parts WHERE id=? AND job_order_id=?`,[id,jobOrderId]);
  await logActivity(user,"Removed a part from the job order.",jobOrderId);
  revalidatePath(`/job-orders/${jobOrderId}`);
}

export async function removeJobOrderService(fd: FormData) {
  const user = await requireJobOrderEditor();
  const id = numberValue(fd,"job_order_service_id");
  const jobOrderId = numberValue(fd,"job_order_id");
  await pool.execute(`DELETE FROM job_order_services WHERE id=? AND job_order_id=?`,[id,jobOrderId]);
  await logActivity(user,"Removed a service from the job order.",jobOrderId);
  revalidatePath(`/job-orders/${jobOrderId}`);
}

export async function updateJobOrderStatus(fd: FormData) {
  const user = await requireJobOrderEditor();
  const id = numberValue(fd,"job_order_id");
  const status = text(fd,"status");
  const remarks = text(fd,"status_remarks") || null;
  if (!id || !allowedStatuses.has(status)) redirect("/job-orders");
  const [rows] = await pool.execute<JobRow[]>(`SELECT id,status,assigned_mechanic_id FROM job_orders WHERE id=? LIMIT 1`,[id]);
  const job = rows[0];
  if (!job) redirect("/job-orders");
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(`UPDATE job_orders SET status=?, updated_by=?,
      date_completed=CASE WHEN ?='COMPLETED' THEN COALESCE(date_completed,NOW()) ELSE date_completed END,
      paid_at=CASE WHEN ?='PAID' THEN COALESCE(paid_at,NOW()) ELSE paid_at END,
      released_at=CASE WHEN ?='RELEASED' THEN COALESCE(released_at,NOW()) ELSE released_at END
      WHERE id=?`,[status,user.id,status,status,status,id]);
    await connection.execute(`INSERT INTO job_order_status_logs
      (job_order_id,from_status,to_status,remarks,changed_by,changed_by_name)
      VALUES (?,?,?,?,?,?)`,[id,job.status,status,remarks,user.id,user.fullName]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  await logActivity(user,`Changed job order status from ${job.status} to ${status}.`,id);
  revalidatePath(`/job-orders/${id}`);
  revalidatePath("/job-orders");
  redirect(url(`/job-orders/${id}`,"success",`Status changed to ${status.replaceAll("_"," ")}.`));
}
