import type { RowDataPacket } from "mysql2";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { PosClient } from "./pos-client";
import styles from "./pos.module.css";

interface ProductRow extends RowDataPacket { id:number; product_code:string; barcode:string|null; product_name:string; selling_price:number; quantity_on_hand:number; unit:string; }
interface BatchRow extends RowDataPacket { id:number; product_id:number; batch_number:string; barcode:string; quantity_remaining:number; selling_price:number; received_at:Date; }
interface ClientRow extends RowDataPacket { id:number; client_name:string; mobile_number:string|null; }
interface MotorcycleRow extends RowDataPacket { id:number; client_id:number; plate_number:string; model_name:string; }
interface JobRow extends RowDataPacket { id:number; job_order_number:string; client_id:number|null; motorcycle_id:number|null; status:string; mechanic_name:string|null; }
interface JobPartRow extends RowDataPacket { product_id:number; product_name:string; quantity:number; unit_price:number; }
interface JobServiceRow extends RowDataPacket { id:number; service_name:string; service_charge:number; mechanic_name:string|null; }
interface PosPageProps { searchParams: Promise<{ success?:string; error?:string; job_order_id?:string }>; }

export default async function PosPage({ searchParams }: PosPageProps) {
  const user=await getCurrentUser(); if(!user) redirect("/"); if(!["ADMIN","CASHIER"].includes(user.role)) redirect("/dashboard");
  const params=await searchParams;
  const [products]=await pool.query<ProductRow[]>(`SELECT id,product_code,barcode,product_name,selling_price,quantity_on_hand,unit FROM products WHERE is_active=1 ORDER BY product_name`);
  const [batches]=await pool.query<BatchRow[]>(`SELECT id,product_id,batch_number,barcode,quantity_remaining,selling_price,received_at FROM stock_in_batches WHERE status='ACTIVE' AND quantity_remaining>0 ORDER BY received_at,id`);
  const [clients]=await pool.query<ClientRow[]>(`SELECT id,client_name,mobile_number FROM clients WHERE is_active=1 ORDER BY client_name`);
  const [motorcycles]=await pool.query<MotorcycleRow[]>(`SELECT m.id,m.client_id,m.plate_number,mm.model_name FROM motorcycles m JOIN motorcycle_models mm ON mm.id=m.model_id WHERE m.is_active=1 ORDER BY m.plate_number`);

  let jobOrder:null|{id:number;job_order_number:string;client_id:number|null;motorcycle_id:number|null;mechanic_name:string|null;parts:JobPartRow[];services:JobServiceRow[]}=null;
  const jobId=Number(params.job_order_id||0);
  if(Number.isInteger(jobId)&&jobId>0){
    const [jobs]=await pool.execute<JobRow[]>(`SELECT jo.id,jo.job_order_number,jo.client_id,jo.motorcycle_id,jo.status,m.full_name mechanic_name FROM job_orders jo LEFT JOIN mechanics m ON m.id=jo.assigned_mechanic_id WHERE jo.id=? LIMIT 1`,[jobId]);
    const job=jobs[0];
    if(!job) redirect(`/pos?error=${encodeURIComponent("Job order not found.")}`);
    if(job.status!=="READY_FOR_PAYMENT") redirect(`/job-orders/${job.id}?error=${encodeURIComponent("Job order must be READY FOR PAYMENT before opening POS.")}`);
    const [parts]=await pool.execute<JobPartRow[]>(`SELECT product_id,product_name,quantity,unit_price FROM job_order_parts WHERE job_order_id=? ORDER BY id`,[jobId]);
    const [services]=await pool.execute<JobServiceRow[]>(`SELECT js.id,js.service_name,js.service_charge,m.full_name mechanic_name FROM job_order_services js LEFT JOIN mechanics m ON m.id=js.mechanic_id WHERE js.job_order_id=? AND js.status<>'CANCELLED' ORDER BY js.id`,[jobId]);
    let resolvedMotorcycleId = job.motorcycle_id;
    if (!resolvedMotorcycleId && job.client_id) {
      const clientMotorcycles = motorcycles.filter((m) => m.client_id === job.client_id);
      if (clientMotorcycles.length === 1) {
        resolvedMotorcycleId = clientMotorcycles[0].id;
      }
    }

    jobOrder={id:job.id,job_order_number:job.job_order_number,client_id:job.client_id,motorcycle_id:resolvedMotorcycleId,mechanic_name:job.mechanic_name,parts,services};
  }

  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.headerLeft}><Link href="/dashboard" className={styles.backButton}><ArrowLeft size={18}/> Dashboard</Link><div className={styles.titleLine}><div className={styles.titleIcon}><ShoppingCart size={25}/></div><div><p>Sales Terminal</p><h1>Point of Sale</h1></div></div></div><div className={styles.cashier}><span>Cashier</span><strong>{user.fullName}</strong></div></header>
    <PosClient
      products={products.map(r=>({...r,selling_price:Number(r.selling_price),quantity_on_hand:Number(r.quantity_on_hand)}))}
      batches={batches.map(r=>({...r,quantity_remaining:Number(r.quantity_remaining),selling_price:Number(r.selling_price),received_at:new Date(r.received_at).toISOString()}))}
      clients={clients} motorcycles={motorcycles} success={params.success} error={params.error}
      jobOrder={jobOrder?{...jobOrder,parts:jobOrder.parts.map(p=>({...p,quantity:Number(p.quantity),unit_price:Number(p.unit_price)})),services:jobOrder.services.map(s=>({...s,service_charge:Number(s.service_charge)}))}:null}
    />
  </main>;
}
