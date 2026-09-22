import type {RowDataPacket} from "mysql2";
import Link from "next/link";
import {redirect} from "next/navigation";
import {getCurrentUser} from "@/lib/auth";
import {pool} from "@/lib/db";
import ProductQr from "./qr-code";
import PrintButton from "./print-button";
import styles from "./labels.module.css";
interface Row extends RowDataPacket{id:number;product_code:string;barcode:string;product_name:string;selling_price:number;label_count:number}
function peso(n:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(n)}
export default async function Page({searchParams}:{searchParams:Promise<{transaction?:string}>}){const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","INVENTORY","OWNER"].includes(user.role))redirect("/dashboard");const p=await searchParams;const tid=Number(p.transaction);if(!Number.isInteger(tid)||tid<=0)redirect("/inventory/initial-inventory");
 const [rows]=await pool.query<Row[]>(`SELECT p.id,p.product_code,p.barcode,p.product_name,p.selling_price,l.label_count FROM initial_inventory_labels l JOIN products p ON p.id=l.product_id WHERE l.stock_transaction_id=? AND l.label_count>0 ORDER BY p.product_name`,[tid]);
 const labels=rows.flatMap(r=>Array.from({length:Number(r.label_count)},(_,i)=>({...r,copy:i+1})));
 return <main className={styles.page}><div className={styles.toolbar}><Link href="/products">← Products</Link><div><strong>{labels.length} QR label{labels.length===1?"":"s"} ready</strong><span>QR identifies the product, not the stock-in batch.</span></div>{labels.length>0?<PrintButton/>:null}</div>{labels.length===0?<div className={styles.empty}>Inventory was saved. No QR labels were requested.</div>:<section className={styles.sheet}>{labels.map((x,i)=><article className={styles.label} key={`${x.id}-${x.copy}-${i}`}><div className={styles.shop}>KL MOTOR SHOP</div><div className={styles.body}><div className={styles.qr}><ProductQr value={x.barcode}/></div><div className={styles.info}><div className={styles.name}>{x.product_name}</div><div className={styles.price}>{peso(Number(x.selling_price))}</div><div className={styles.code}>{x.product_code}</div></div></div></article>)}</section>}</main>}
