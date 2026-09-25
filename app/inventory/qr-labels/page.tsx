import type {RowDataPacket} from "mysql2";
import {redirect} from "next/navigation";
import {getCurrentUser} from "@/lib/auth";
import {pool} from "@/lib/db";
import QrLabelsClient from "./qr-labels-client";

interface ProductRow extends RowDataPacket {
  id:number; product_code:string; barcode:string|null; product_name:string;
  category_name:string|null; quantity_on_hand:number; selling_price:number;
}

export default async function QrLabelsPage(){
  const user=await getCurrentUser();
  if(!user) redirect("/");
  if(!["ADMIN","INVENTORY","OWNER"].includes(user.role)) redirect("/dashboard");
  const [rows]=await pool.query<ProductRow[]>(`
    SELECT p.id,p.product_code,p.barcode,p.product_name,pc.category_name,
           p.quantity_on_hand,p.selling_price
    FROM products p
    LEFT JOIN product_categories pc ON pc.id=p.category_id
    WHERE p.is_active=1
    ORDER BY p.product_name
  `);
  const products=rows.map(r=>({
    id:Number(r.id), productCode:r.product_code, barcode:r.barcode||r.product_code,
    productName:r.product_name, categoryName:r.category_name||"Uncategorized",
    stock:Number(r.quantity_on_hand), sellingPrice:Number(r.selling_price)
  }));
  return <QrLabelsClient products={products}/>;
}
