import type { RowDataPacket } from "mysql2";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";

interface PO extends RowDataPacket{id:number;po_number:string;order_date:Date|string;expected_date:Date|string|null;status:string;total_amount:number;remarks:string|null;supplier_name:string}
interface Item extends RowDataPacket{id:number;product_name:string;product_code:string;quantity_ordered:number;quantity_received:number;unit_cost:number;line_total:number}

export default async function PODetail({params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser();if(!user)redirect("/");if(!["ADMIN","OWNER","INVENTORY"].includes(user.role))redirect("/dashboard");
 const {id:raw}=await params,id=Number(raw);if(!Number.isInteger(id)||id<=0)notFound();
 const [pos]=await pool.execute<PO[]>(`SELECT po.*,s.supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id WHERE po.id=? LIMIT 1`,[id]);
 const po=pos[0];if(!po)notFound();
 const [items]=await pool.execute<Item[]>(`SELECT poi.id,p.product_name,p.product_code,poi.quantity_ordered,poi.quantity_received,poi.unit_cost,poi.line_total FROM purchase_order_items poi JOIN products p ON p.id=poi.product_id WHERE poi.purchase_order_id=? ORDER BY p.product_name`,[id]);
 const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));
 return <main style={{minHeight:"100vh",background:"#eef2f6",padding:24,color:"#10213a"}}><div style={{maxWidth:1200,margin:"0 auto"}}><Link href="/purchasing/purchase-orders" style={{display:"inline-flex",alignItems:"center",gap:7,textDecoration:"none",color:"#334155",fontWeight:800,marginBottom:16}}><ArrowLeft size={17}/>Purchase Orders</Link>
 <section style={{background:"#fff",border:"1px solid #dbe3ea",borderTop:"4px solid #0f766e",borderRadius:14,padding:18,marginBottom:14}}><div style={{fontSize:11,fontWeight:900,textTransform:"uppercase",color:"#0f766e"}}>{po.status.replaceAll("_"," ")}</div><h1 style={{margin:"5px 0"}}>{po.po_number}</h1><p style={{margin:0,color:"#64748b"}}>{po.supplier_name} • {new Date(po.order_date).toLocaleString("en-PH")}</p></section>
 <section style={{background:"#fff",border:"1px solid #dbe3ea",borderRadius:14,padding:16}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={{textAlign:"left"}}>Product</th><th>Ordered</th><th>Received</th><th>Unit Cost</th><th>Line Total</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td style={{padding:"10px 8px",borderBottom:"1px solid #e5e7eb"}}><strong>{i.product_name}</strong><div style={{color:"#64748b",fontSize:11}}>{i.product_code}</div></td><td style={{textAlign:"center"}}>{Number(i.quantity_ordered).toFixed(2)}</td><td style={{textAlign:"center"}}>{Number(i.quantity_received).toFixed(2)}</td><td style={{textAlign:"right"}}>{money(i.unit_cost)}</td><td style={{textAlign:"right"}}><strong>{money(i.line_total)}</strong></td></tr>)}</tbody></table><div style={{display:"flex",justifyContent:"flex-end",marginTop:16,fontSize:22,fontWeight:900}}>Total: {money(po.total_amount)}</div></section>
 <section style={{marginTop:14,padding:14,borderRadius:12,background:"#ecfeff",border:"1px solid #a5f3fc",color:"#155e75",display:"flex",justifyContent:"space-between",alignItems:"center",gap:14}}>
   <div><strong>Receiving workflow:</strong><div style={{marginTop:4,fontSize:13}}>Receive this PO directly into Stock In. The supplier and products are already linked, and the system will create batches/barcodes automatically.</div></div>
   {!["RECEIVED","CANCELLED"].includes(po.status) && ["ADMIN","INVENTORY"].includes(user.role) ? <Link href={`/purchasing/purchase-orders/${id}/receive`} style={{whiteSpace:"nowrap",padding:"9px 13px",borderRadius:8,background:"#0f766e",color:"#fff",textDecoration:"none",fontWeight:900}}>Receive PO</Link> : null}
 </section>
 </div></main>
}
