"use client";
import {useMemo,useRef,useState} from "react";
import Link from "next/link";
import {ArrowLeft,Download,FileSpreadsheet,Printer,Upload} from "lucide-react";
import * as XLSX from "xlsx";
import {saveInitialInventory} from "./actions";
import styles from "./initial-inventory.module.css";

type Product={id:number;product_code:string;product_name:string;category_name:string|null;unit:string;quantity_on_hand:number;cost_price:number;selling_price:number};
type Line={productId:number;productCode:string;productName:string;currentQty:number;countedQty:number;qrLabels:number};
export default function InitialInventoryClient({products,serverError}:{products:Product[];serverError?:string}){
 const inputRef=useRef<HTMLInputElement>(null); const [lines,setLines]=useState<Line[]>([]); const [error,setError]=useState("");
 const changed=useMemo(()=>lines.filter(x=>x.countedQty!==x.currentQty||x.qrLabels>0),[lines]);
 function download(){
  const data=products.map(p=>({"Product ID":p.id,"Product Code":p.product_code,"Product Name":p.product_name,"Category":p.category_name||"","Unit":p.unit,"Current Qty":p.quantity_on_hand,"Counted Qty":"","QR Labels":""}));
  const ws=XLSX.utils.json_to_sheet(data); ws["!cols"]=[{wch:12},{wch:18},{wch:34},{wch:22},{wch:12},{wch:14},{wch:16},{wch:12}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"Initial Inventory"); XLSX.writeFile(wb,`KL-Motor-Shop-Initial-Inventory.xlsx`);
 }
 async function upload(file:File){
  setError(""); try{const wb=XLSX.read(await file.arrayBuffer(),{type:"array"}); const ws=wb.Sheets[wb.SheetNames[0]]; const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(ws,{defval:""}); const seen=new Set<number>(); const parsed:Line[]=[];
   for(let i=0;i<rows.length;i++){const r=rows[i]; const id=Number(r["Product ID"]); const product=products.find(p=>p.id===id); if(!product)throw new Error(`Row ${i+2}: Product ID ${id||"blank"} is not valid.`); if(seen.has(id))throw new Error(`Row ${i+2}: ${product.product_name} appears more than once.`); seen.add(id);
    const cqRaw=String(r["Counted Qty"]??"").trim(); const qrRaw=String(r["QR Labels"]??"").trim(); if(cqRaw===""&&qrRaw==="")continue;
    const counted=cqRaw===""?product.quantity_on_hand:Number(cqRaw); const qr=qrRaw===""?0:Number(qrRaw);
    if(!Number.isInteger(counted)||counted<0)throw new Error(`Row ${i+2}: Counted Qty must be a whole number zero or greater.`); if(counted<product.quantity_on_hand)throw new Error(`Row ${i+2}: Counted Qty for ${product.product_name} is below current stock. Use Stock Adjustment for reductions.`); if(!Number.isInteger(qr)||qr<0)throw new Error(`Row ${i+2}: QR Labels must be a whole number zero or greater.`);
    parsed.push({productId:id,productCode:product.product_code,productName:product.product_name,currentQty:product.quantity_on_hand,countedQty:counted,qrLabels:qr}); }
   if(parsed.length===0)throw new Error("No Counted Qty or QR Labels values were entered in the Excel file."); setLines(parsed);
  }catch(e){setLines([]);setError(e instanceof Error?e.message:"Unable to read the Excel file.");} finally{if(inputRef.current)inputRef.current.value="";}
 }
 return <main className={styles.page}><header className={styles.header}><div><Link href="/products" className={styles.back}><ArrowLeft size={18}/> Products</Link><p>Deployment Tool</p><h1>Initial Inventory</h1><span>Download your product list, enter physical counts and QR label quantities, then upload and review before saving.</span></div></header>
 <section className={styles.steps}><article><strong>1</strong><div><h3>Download Excel</h3><p>Current stock is included for reference.</p></div></article><article><strong>2</strong><div><h3>Count & enter</h3><p>Counted Qty is the final physical quantity. QR Labels is independent.</p></div></article><article><strong>3</strong><div><h3>Upload & review</h3><p>No stock changes happen until you confirm.</p></div></article></section>
 {(serverError||error)&&<div className={styles.error}>{serverError||error}</div>}
 <section className={styles.actions}><button onClick={download}><Download size={19}/> Download Product Excel</button><button className={styles.upload} onClick={()=>inputRef.current?.click()}><Upload size={19}/> Upload Completed Excel</button><input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f)}}/></section>
 <section className={styles.help}><FileSpreadsheet size={22}/><div><strong>Example: Bolt 10mm</strong><span>If Current Qty is 0, Counted Qty can be 100 while QR Labels can be only 1 for the storage bin.</span></div></section>
 {lines.length>0&&<form action={saveInitialInventory} className={styles.panel}><input type="hidden" name="lines" value={JSON.stringify(changed.map(x=>({productId:x.productId,countedQty:x.countedQty,qrLabels:x.qrLabels})))}/><div className={styles.panelHead}><div><p>Import Preview</p><h2>Review before saving</h2></div><span>{changed.length} line{changed.length===1?"":"s"}</span></div><div className={styles.tableWrap}><table><thead><tr><th>Code</th><th>Product</th><th>Current</th><th>Counted</th><th>Stock Added</th><th>QR Labels</th></tr></thead><tbody>{lines.map((x,i)=><tr key={x.productId}><td>{x.productCode}</td><td><strong>{x.productName}</strong></td><td>{x.currentQty}</td><td><input type="number" min={x.currentQty} step="1" value={x.countedQty} onChange={e=>setLines(v=>v.map((a,j)=>j===i?{...a,countedQty:Number(e.target.value)}:a))}/></td><td className={x.countedQty>x.currentQty?styles.plus:""}>{x.countedQty>x.currentQty?`+${x.countedQty-x.currentQty}`:"—"}</td><td><input type="number" min="0" step="1" value={x.qrLabels} onChange={e=>setLines(v=>v.map((a,j)=>j===i?{...a,qrLabels:Number(e.target.value)}:a))}/></td></tr>)}</tbody></table></div><div className={styles.confirm}><div><Printer size={20}/><span>After saving, the QR label print page opens automatically.</span></div><button type="submit" disabled={changed.length===0}>Confirm Initial Inventory</button></div></form>}
 </main>;
}
