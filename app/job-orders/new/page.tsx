import type { RowDataPacket } from "mysql2";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import NewJobOrderForm from "./NewJobOrderForm";
import styles from "../job-orders.module.css";

interface ClientRow extends RowDataPacket {
  id: number;
  client_name: string;
}

interface MotorcycleRow extends RowDataPacket {
  id: number;
  client_id: number;
  plate_number: string;
  model_name: string;
}

interface MechanicRow extends RowDataPacket {
  id: number;
  full_name: string;
}

export default async function NewJobOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "CASHIER"].includes(user.role)) redirect("/job-orders");

  const params = await searchParams;

  const [clients] = await pool.query<ClientRow[]>(`
    SELECT id, client_name
    FROM clients
    WHERE is_active = 1
    ORDER BY client_name
  `);

  const [motorcycles] = await pool.query<MotorcycleRow[]>(`
    SELECT
      m.id,
      m.client_id,
      m.plate_number,
      mm.model_name
    FROM motorcycles m
    JOIN motorcycle_models mm
      ON mm.id = m.model_id
    WHERE m.is_active = 1
    ORDER BY m.plate_number
  `);

  const [mechanics] = await pool.query<MechanicRow[]>(`
    SELECT id, full_name
    FROM mechanics
    WHERE is_active = 1
    ORDER BY full_name
  `);

  return (
    <main className={styles.page}>
      <Link href="/job-orders" className={styles.back}>
        <ArrowLeft size={17} /> Back to Job Orders
      </Link>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Workshop</div>
          <h1>New Job Order</h1>
          <p>
            Cashier receives the motorcycle, records the concern, and assigns a mechanic.
          </p>
        </div>
        <ClipboardPlus size={34} />
      </section>

      {params.error ? (
        <div className={styles.messages}>
          <div className={styles.error}>{params.error}</div>
        </div>
      ) : null}

      <NewJobOrderForm
        clients={clients.map((client) => ({
          id: client.id,
          client_name: client.client_name,
        }))}
        motorcycles={motorcycles.map((motorcycle) => ({
          id: motorcycle.id,
          client_id: motorcycle.client_id,
          plate_number: motorcycle.plate_number,
          model_name: motorcycle.model_name,
        }))}
        mechanics={mechanics.map((mechanic) => ({
          id: mechanic.id,
          full_name: mechanic.full_name,
        }))}
      />
    </main>
  );
}
