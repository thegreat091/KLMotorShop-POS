import type { RowDataPacket } from "mysql2";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import InitialInventoryClient from "./initial-inventory-client";

interface ProductRow extends RowDataPacket { id:number; product_code:string; product_name:string; category_name:string|null; unit:string; quantity_on_hand:number; cost_price:number; selling_price:number; }
export default async function InitialInventoryPage({searchParams}:{searchParams:Promise<{error?:string}>}){
 const user=await getCurrentUser(); if(!user)redirect("/"); if(!["ADMIN","INVENTORY"].includes(user.role))redirect("/dashboard");
 const params=await searchParams;
 const [rows]=await pool.query<ProductRow[]>(`SELECT p.id,p.product_code,p.product_name,pc.category_name,p.unit,p.quantity_on_hand,p.cost_price,p.selling_price FROM products p LEFT JOIN product_categories pc ON pc.id=p.category_id WHERE p.is_active=1 ORDER BY p.product_name`);
 const products=rows.map(r=>({...r,quantity_on_hand:Number(r.quantity_on_hand),cost_price:Number(r.cost_price),selling_price:Number(r.selling_price)}));
 return <InitialInventoryClient products={products} serverError={params.error}/>;
}
