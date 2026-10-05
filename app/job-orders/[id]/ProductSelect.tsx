"use client";

import { useState } from "react";
import styles from "../job-orders.module.css";
import SearchableSelect from "../SearchableSelect";

type Product = { id:number; product_name:string; product_code:string; selling_price:number; quantity_on_hand:number };

export default function ProductSelect({products}:{products:Product[]}) {
  const [productId,setProductId]=useState("");
  return <label className={styles.field}>
    <span>Product</span>
    <SearchableSelect
      name="product_id"
      value={productId}
      onChange={setProductId}
      required
      placeholder="Search product"
      options={products.map(p=>({value:String(p.id),label:`${p.product_name} — ${p.product_code} — ₱${Number(p.selling_price).toFixed(2)} (${Number(p.quantity_on_hand)} stock)`}))}
    />
  </label>;
}
