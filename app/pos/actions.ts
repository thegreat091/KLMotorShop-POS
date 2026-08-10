"use server";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

type PaymentMethod = "CASH" | "GCASH" | "BANK_TRANSFER" | "CARD" | "OTHER";

interface CartItemInput {
  batchId: number;
  quantity: number;
}

interface BatchRow extends RowDataPacket {
  id: number;
  product_id: number;
  batch_number: string;
  barcode: string;
  quantity_remaining: number;
  unit_cost: number;
  selling_price: number;
  product_code: string;
  product_name: string;
  product_selling_price: number;
  product_quantity: number;
  is_active: number;
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: FormDataEntryValue | null): number {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : Number.NaN;
}

function positiveId(value: FormDataEntryValue | null): number | null {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function ymd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function fail(message: string): never {
  redirect(`/pos?error=${encodeURIComponent(message)}`);
}

async function requireCashier() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN" && user.role !== "CASHIER") redirect("/dashboard");
  return user;
}

async function logActivity(
  connection: PoolConnection,
  params: {
    userId: number;
    userName: string;
    userRole: string;
    action: string;
    saleId: number;
  },
) {
  await connection.execute(
    `
      INSERT INTO activity_logs (
        user_id, user_name, user_role, action,
        module, reference_table, reference_id
      ) VALUES (?, ?, ?, ?, 'Sales', 'sales', ?)
    `,
    [params.userId, params.userName, params.userRole, params.action, String(params.saleId)],
  );
}

export async function completeProductSale(formData: FormData) {
  const user = await requireCashier();

  const rawCart = text(formData.get("cart_json"));
  const clientId = positiveId(formData.get("client_id"));
  const motorcycleId = positiveId(formData.get("motorcycle_id"));
  const discountAmount = money(formData.get("discount_amount"));
  const amountTenderedInput = money(formData.get("amount_tendered"));
  const paymentMethodRaw = text(formData.get("payment_method")).toUpperCase();
  const remarks = text(formData.get("remarks"));
  const jobOrderId = positiveId(formData.get("job_order_id"));

  const allowedPayments: PaymentMethod[] = ["CASH", "GCASH", "BANK_TRANSFER", "CARD", "OTHER"];
  if (!allowedPayments.includes(paymentMethodRaw as PaymentMethod)) {
    fail("Select a valid payment method.");
  }
  const paymentMethod = paymentMethodRaw as PaymentMethod;

  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    fail("Discount must be zero or greater.");
  }

  let cart: CartItemInput[] = [];
  try {
    const parsed = JSON.parse(rawCart) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid cart");
    cart = parsed.map((item) => {
      const candidate = item as Partial<CartItemInput>;
      return {
        batchId: Number(candidate.batchId),
        quantity: Number(candidate.quantity),
      };
    });
  } catch {
    fail("The sale cart is invalid. Reload the POS and try again.");
  }

  if (cart.length === 0 && !jobOrderId) fail("Add at least one product to the cart.");
  if (cart.some((item) => !Number.isInteger(item.batchId) || item.batchId <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    fail("One or more cart quantities are invalid.");
  }

  // Merge duplicate batch rows before locking stock.
  const merged = new Map<number, number>();
  for (const item of cart) merged.set(item.batchId, (merged.get(item.batchId) ?? 0) + item.quantity);
  const items = Array.from(merged, ([batchId, quantity]) => ({ batchId, quantity }));

  const connection = await pool.getConnection();
  let saleId = 0;
  let saleNumber = "";

  try {
    await connection.beginTransaction();

    let effectiveClientId = clientId;
    let effectiveMotorcycleId = motorcycleId;

    // In Job Order mode, resolve the customer/motorcycle from the Job Order first.
    // This keeps checkout consistent with the POS handoff, including older Job Orders
    // where motorcycle_id may still be NULL.
    let lockedJob: (RowDataPacket & {
      id: number;
      client_id: number | null;
      motorcycle_id: number | null;
      status: string;
    }) | null = null;

    if (jobOrderId) {
      const [jobs] = await connection.query<Array<RowDataPacket & {
        id: number;
        client_id: number | null;
        motorcycle_id: number | null;
        status: string;
      }>>(
        `SELECT id, client_id, motorcycle_id, status FROM job_orders WHERE id = ? LIMIT 1 FOR UPDATE`,
        [jobOrderId],
      );

      lockedJob = jobs[0] ?? null;
      if (!lockedJob || lockedJob.status !== "READY_FOR_PAYMENT") {
        throw new Error("Job Order is not ready for payment.");
      }

      effectiveClientId = lockedJob.client_id == null ? null : Number(lockedJob.client_id);
      effectiveMotorcycleId = lockedJob.motorcycle_id == null ? null : Number(lockedJob.motorcycle_id);

      if (!effectiveMotorcycleId && effectiveClientId) {
        const [ownedMotorcycles] = await connection.query<Array<RowDataPacket & { id: number }>>(
          `SELECT id FROM motorcycles WHERE client_id = ? AND is_active = 1 ORDER BY id LIMIT 2`,
          [effectiveClientId],
        );

        if (ownedMotorcycles.length === 1) {
          effectiveMotorcycleId = Number(ownedMotorcycles[0].id);

          // Repair the older Job Order so future opens/payments use the same motorcycle.
          await connection.execute(
            `UPDATE job_orders SET motorcycle_id = ?, updated_at = NOW() WHERE id = ?`,
            [effectiveMotorcycleId, jobOrderId],
          );
        }
      }

      if ((clientId ?? null) !== (effectiveClientId ?? null)) {
        throw new Error("The POS customer no longer matches the Job Order. Reopen POS from the Job Order.");
      }
      if ((motorcycleId ?? null) !== (effectiveMotorcycleId ?? null)) {
        throw new Error("The POS motorcycle no longer matches the Job Order. Reopen POS from the Job Order.");
      }
    }

    if (effectiveClientId) {
      const [clients] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM clients WHERE id = ? AND is_active = 1 LIMIT 1`,
        [effectiveClientId],
      );
      if (!clients[0]) throw new Error("The selected client is unavailable.");
    }

    if (effectiveMotorcycleId) {
      const [motorcycles] = await connection.query<Array<RowDataPacket & { client_id: number }>>(
        `SELECT id, client_id FROM motorcycles WHERE id = ? AND is_active = 1 LIMIT 1`,
        [effectiveMotorcycleId],
      );
      if (!motorcycles[0]) throw new Error("The selected motorcycle is unavailable.");
      if (effectiveClientId && Number(motorcycles[0].client_id) !== effectiveClientId) {
        throw new Error("The Job Order motorcycle does not belong to the Job Order client.");
      }
    }

    let jobServices: Array<RowDataPacket & { id:number; service_id:number; mechanic_id:number|null; service_name:string; service_charge:number; mechanic_percentage:number; mechanic_share:number }> = [];
    if (jobOrderId) {
      const [rows]=await connection.query<typeof jobServices>(`SELECT id,service_id,mechanic_id,service_name,service_charge,mechanic_percentage,mechanic_share FROM job_order_services WHERE job_order_id=? AND status<>'CANCELLED'`,[jobOrderId]);
      jobServices=rows;

      const [partRows]=await connection.query<Array<RowDataPacket & {product_id:number; quantity:number}>>(`SELECT product_id,SUM(quantity) quantity FROM job_order_parts WHERE job_order_id=? GROUP BY product_id`,[jobOrderId]);
      const expected=new Map(partRows.map(r=>[Number(r.product_id),Number(r.quantity)]));
      const actual=new Map<number,number>();
      for(const item of items){
        const [br]=await connection.query<Array<RowDataPacket & {product_id:number}>>(`SELECT product_id FROM stock_in_batches WHERE id=? LIMIT 1`,[item.batchId]);
        if(!br[0]) throw new Error("A Job Order part batch no longer exists.");
        const pid=Number(br[0].product_id); actual.set(pid,(actual.get(pid)??0)+item.quantity);
      }
      if(expected.size!==actual.size || [...expected].some(([pid,qty])=>actual.get(pid)!==qty)) throw new Error("POS parts no longer match the Job Order. Return to the Job Order and reopen POS.");
    }

    const lockedItems: Array<{ batch: BatchRow; quantity: number; unitPrice: number; lineTotal: number }> = [];
    let subtotal = 0;

    for (const item of items) {
      const [batches] = await connection.query<BatchRow[]>(
        `
          SELECT
            sib.id, sib.product_id, sib.batch_number, sib.barcode,
            sib.quantity_remaining, sib.unit_cost, sib.selling_price,
            p.product_code, p.product_name,
            p.selling_price AS product_selling_price,
            p.quantity_on_hand AS product_quantity,
            p.is_active
          FROM stock_in_batches sib
          JOIN products p ON p.id = sib.product_id
          WHERE sib.id = ?
            AND sib.status = 'ACTIVE'
            AND sib.quantity_remaining > 0
          LIMIT 1
          FOR UPDATE
        `,
        [item.batchId],
      );

      const batch = batches[0];
      if (!batch || batch.is_active !== 1) throw new Error("A product batch in the cart is no longer available.");
      if (item.quantity > Number(batch.quantity_remaining)) {
        throw new Error(`${batch.product_name}: only ${Number(batch.quantity_remaining)} item(s) remain in batch ${batch.batch_number}.`);
      }
      if (item.quantity > Number(batch.product_quantity)) {
        throw new Error(`${batch.product_name}: total product stock is insufficient.`);
      }

      const unitPrice = Number(batch.selling_price) > 0
        ? Number(batch.selling_price)
        : Number(batch.product_selling_price);
      if (unitPrice < 0) throw new Error(`${batch.product_name} has an invalid selling price.`);

      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      subtotal += lineTotal;
      lockedItems.push({ batch, quantity: item.quantity, unitPrice, lineTotal });
    }

    subtotal = Math.round((subtotal + jobServices.reduce((sum,s)=>sum+Number(s.service_charge),0)) * 100) / 100;
    if (discountAmount > subtotal) throw new Error("Discount cannot be greater than the subtotal.");
    const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;

    const amountTendered = amountTenderedInput;

    if (!Number.isFinite(amountTendered) || amountTendered < totalAmount) {
      throw new Error(`Payment is incomplete. Amount tendered must be at least ₱${totalAmount.toFixed(2)}.`);
    }
    const changeAmount = paymentMethod === "CASH"
      ? Math.round((amountTendered - totalAmount) * 100) / 100
      : 0;

    const temporaryNumber = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [saleResult] = await connection.execute<ResultSetHeader>(
      `
        INSERT INTO sales (
          sale_number, client_id, motorcycle_id, job_order_id, sale_date,
          subtotal, discount_amount, total_amount,
          amount_tendered, change_amount, payment_method,
          status, remarks, cashier_id
        ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)
      `,
      [
        temporaryNumber,
        effectiveClientId,
        effectiveMotorcycleId,
        jobOrderId,
        subtotal,
        discountAmount,
        totalAmount,
        amountTendered,
        changeAmount,
        paymentMethod,
        remarks || null,
        user.id,
      ],
    );

    saleId = saleResult.insertId;
    saleNumber = `SL-${ymd()}-${String(saleId).padStart(6, "0")}`;
    await connection.execute(`UPDATE sales SET sale_number = ? WHERE id = ?`, [saleNumber, saleId]);

    for (const item of lockedItems) {
      const newBatchQty = Number(item.batch.quantity_remaining) - item.quantity;

      const [itemResult] = await connection.execute<ResultSetHeader>(
        `
          INSERT INTO sale_items (
            sale_id, product_id, product_code, product_name,
            quantity, unit_price, discount_amount, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        `,
        [
          saleId,
          item.batch.product_id,
          item.batch.product_code,
          item.batch.product_name,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
        ],
      );

      await connection.execute(
        `
          INSERT INTO sale_item_batches (
            sale_item_id, sale_id, product_id, stock_in_batch_id,
            batch_number, batch_barcode, quantity, unit_cost
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          itemResult.insertId,
          saleId,
          item.batch.product_id,
          item.batch.id,
          item.batch.batch_number,
          item.batch.barcode,
          item.quantity,
          Number(item.batch.unit_cost),
        ],
      );

      await connection.execute(
        `
          UPDATE stock_in_batches
          SET quantity_remaining = ?,
              status = CASE WHEN ? <= 0 THEN 'DEPLETED' ELSE 'ACTIVE' END
          WHERE id = ?
        `,
        [newBatchQty, newBatchQty, item.batch.id],
      );

      await connection.execute(
        `
          UPDATE products
          SET quantity_on_hand = quantity_on_hand - ?, updated_by = ?
          WHERE id = ? AND quantity_on_hand >= ?
        `,
        [item.quantity, user.id, item.batch.product_id, item.quantity],
      );

      const [balanceRows] = await connection.query<Array<RowDataPacket & { quantity_on_hand: number }>>(
        `SELECT quantity_on_hand FROM products WHERE id = ? LIMIT 1`,
        [item.batch.product_id],
      );
      const productBalance = Number(balanceRows[0]?.quantity_on_hand ?? 0);

      await connection.execute(
        `
          INSERT INTO inventory_movements (
            product_id, movement_type, reference_table, reference_id,
            quantity_in, quantity_out, balance_after, unit_cost,
            remarks, created_by
          ) VALUES (?, 'SALE', 'sales', ?, 0, ?, ?, ?, ?, ?)
        `,
        [
          item.batch.product_id,
          String(saleId),
          item.quantity,
          productBalance,
          Number(item.batch.unit_cost),
          `${saleNumber} / Batch ${item.batch.batch_number}`,
          user.id,
        ],
      );
    }


    if (jobOrderId) {
      for (const service of jobServices) {
        if (service.mechanic_id) {
          await connection.execute(`INSERT INTO mechanic_earnings (mechanic_id,job_order_service_id,job_order_id,service_id,service_amount,mechanic_percentage,mechanic_share,earning_date,payout_status,remarks) VALUES (?,?,?,?,?,?,?,NOW(),'UNPAID',?)`,[service.mechanic_id,service.id,jobOrderId,service.service_id,Number(service.service_charge),Number(service.mechanic_percentage),Number(service.mechanic_share),`${saleNumber} / ${service.service_name}`]);
        }
        await connection.execute(`UPDATE job_order_services SET status='COMPLETED',completed_at=COALESCE(completed_at,NOW()) WHERE id=?`,[service.id]);
      }
      const [jobRows]=await connection.query<Array<RowDataPacket & {status:string}>>(`SELECT status FROM job_orders WHERE id=? LIMIT 1`,[jobOrderId]);
      await connection.execute(`UPDATE job_orders SET status='PAID',paid_at=COALESCE(paid_at,NOW()),updated_by=? WHERE id=?`,[user.id,jobOrderId]);
      await connection.execute(`INSERT INTO job_order_status_logs (job_order_id,from_status,to_status,remarks,changed_by,changed_by_name) VALUES (?,?,'PAID',?,?,?)`,[jobOrderId,jobRows[0]?.status??'READY_FOR_PAYMENT',`Paid through ${saleNumber}`,user.id,user.fullName]);
    }

    await logActivity(connection, {
      userId: user.id,
      userName: user.fullName,
      userRole: user.role,
      action: `Completed sale ${saleNumber} for ₱${totalAmount.toFixed(2)}`,
      saleId,
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("POS sale error:", error);
    const message = error instanceof Error ? error.message : "Unable to complete the sale.";
    redirect(`/pos?error=${encodeURIComponent(message)}`);
  } finally {
    connection.release();
  }

  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/inventory/stock-in");
  revalidatePath("/inventory/stock-adjustments");
  revalidatePath("/dashboard");
  if (jobOrderId) { revalidatePath(`/job-orders/${jobOrderId}`); revalidatePath("/job-orders"); }
  redirect(`/pos/receipt/${saleId}?success=${encodeURIComponent(`${saleNumber} completed successfully.`)}`);
}
