"use server";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { accountForPaymentMethod } from "@/lib/finance";

interface CategoryRow extends RowDataPacket {
  id: number;
  category_name: string;
  requires_description: number;
}

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

async function requireExpenseAccess() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN","OWNER","CASHIER"].includes(user.role)) redirect("/dashboard");
  return user;
}

export async function createExpenseAction(formData: FormData) {
  const user = await requireExpenseAccess();

  if (!["ADMIN","CASHIER"].includes(user.role)) {
    redirect("/expenses?error=Only%20the%20Cashier%20can%20record%20expenses.");
  }

  const categoryId = Number(clean(formData.get("category_id")));
  const otherDescription = clean(formData.get("other_description"));
  const payee = clean(formData.get("payee"));
  const paymentMethod = clean(formData.get("payment_method"));
  const amount = Number(clean(formData.get("amount")));
  const referenceNumber = clean(formData.get("reference_number"));
  const remarks = clean(formData.get("remarks"));

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    redirect("/expenses?error=Select%20an%20expense%20category.");
  }

  if (!["CASH","GCASH","BANK_TRANSFER","CARD","OTHER"].includes(paymentMethod)) {
    redirect("/expenses?error=Select%20a%20valid%20payment%20method.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/expenses?error=Expense%20amount%20must%20be%20greater%20than%20zero.");
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [categoryRows] = await connection.execute<CategoryRow[]>(
      `SELECT id,category_name,requires_description
       FROM expense_categories WHERE id=? AND is_active=1 LIMIT 1`,
      [categoryId],
    );
    const category = categoryRows[0];
    if (!category) throw new Error("Expense category not found.");
    if (category.requires_description && !otherDescription) {
      throw new Error('Specify the expense when category is "Others".');
    }

    const [numRows] = await connection.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(id),0)+1 next_no FROM expenses",
    );
    const nextNo = Number(numRows[0]?.next_no ?? 1);
    const now = new Date();
    const pad=(n:number)=>String(n).padStart(2,"0");
    const expenseNumber =
      `EXP-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${String(nextNo).padStart(5,"0")}`;

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO expenses
       (expense_number,expense_date,category_id,other_description,payee,payment_method,amount,reference_number,remarks,created_by)
       VALUES (?,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?)`,
      [
        expenseNumber,
        categoryId,
        category.requires_description ? otherDescription : null,
        payee || null,
        paymentMethod,
        amount.toFixed(2),
        referenceNumber || null,
        remarks || null,
        user.id,
      ],
    );

    const description =
      category.requires_description
        ? `${category.category_name}: ${otherDescription}`
        : category.category_name;

    await connection.execute(
      `INSERT INTO money_ledger
       (entry_date,entry_type,reference_table,reference_id,description,payment_method,account,amount_in,amount_out,processed_by,remarks)
       VALUES (CURRENT_TIMESTAMP,'EXPENSE','expenses',?,?,?,?,0.00,?,?,?)`,
      [
        String(result.insertId),
        `${expenseNumber} - ${description}${payee ? ` - ${payee}` : ""}`,
        paymentMethod,
        accountForPaymentMethod(paymentMethod),
        amount.toFixed(2),
        user.id,
        remarks || null,
      ],
    );

    await connection.execute(
      `INSERT INTO activity_logs
       (user_id,user_name,user_role,action,module,reference_table,reference_id)
       VALUES (?,?,?,?,'Expenses','expenses',?)`,
      [
        user.id,user.fullName,user.role,
        `Recorded expense ${expenseNumber} for PHP ${amount.toFixed(2)}.`,
        String(result.insertId),
      ],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : "Unable to save expense.";
    redirect(`/expenses?error=${encodeURIComponent(message)}`);
  } finally {
    connection.release();
  }

  revalidatePath("/expenses");
  revalidatePath("/money-ledger");
  redirect("/expenses?success=Expense%20recorded.");
}
