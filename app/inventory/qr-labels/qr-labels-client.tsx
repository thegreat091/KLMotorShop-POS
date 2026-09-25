"use client";
import {useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CheckSquare,Printer,Search,Square,X} from "lucide-react";
import {QRCodeSVG} from "qrcode.react";
import styles from "./qr-labels.module.css";

type Product={id:number;productCode:string;barcode:string;productName:string;categoryName:string;stock:number;sellingPrice:number};
type Selection=Record<number,number>;
const LABELS_PER_PAGE=65;
function peso(n:number){return new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(n)}

export default function QrLabelsClient({products}:{products:Product[]}){
 const [search,setSearch]=useState(""); const [category,setCategory]=useState("ALL"); const [selected,setSelected]=useState<Selection>({});
 const [preview,setPreview]=useState(false); const [fromPage,setFromPage]=useState(1); const [toPage,setToPage]=useState(1);
 const categories=useMemo(()=>["ALL",...Array.from(new Set(products.map(p=>p.categoryName))).sort()],[products]);
 const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return products.filter(p=>(category==="ALL"||p.categoryName===category)&&(!q||`${p.productCode} ${p.productName} ${p.barcode}`.toLowerCase().includes(q)))},[products,search,category]);
 const labels=useMemo(()=>products.flatMap(p=>Array.from({length:selected[p.id]||0},(_,i)=>({...p,copy:i+1}))),[products,selected]);
 const pages=useMemo(()=>Array.from({length:Math.ceil(labels.length/LABELS_PER_PAGE)},(_,i)=>labels.slice(i*LABELS_PER_PAGE,(i+1)*LABELS_PER_PAGE)),[labels]);
 const totalPages=pages.length;
 function toggle(p:Product){setSelected(s=>{const n={...s};if(n[p.id])delete n[p.id];else n[p.id]=1;return n})}
 function qty(id:number,n:number){setSelected(s=>({...s,[id]:Math.max(1,Math.floor(Number.isFinite(n)?n:1))}))}
 function clear(){setSelected({});setPreview(false)}
 function showPreview(){if(!labels.length)return;setFromPage(1);setToPage(Math.ceil(labels.length/LABELS_PER_PAGE));setPreview(true);setTimeout(()=>document.getElementById("print-preview")?.scrollIntoView({behavior:"smooth"}),50)}
 function print(){const max=Math.max(1,totalPages);const f=Math.min(Math.max(1,fromPage),max);const t=Math.min(Math.max(f,toPage),max);setFromPage(f);setToPage(t);setTimeout(()=>window.print(),80)}
 return <main className={styles.page}>
  <header className={styles.hero}><div><Link href="/products" className={styles.back}><ArrowLeft size={18}/> Products</Link><p>Inventory</p><h1>QR Label Printing</h1><span>Select existing products and print only the QR labels you need. Printing does not change stock.</span></div></header>
  <section className={styles.controls}><div className={styles.search}><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product, code or QR..."/></div><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c==="ALL"?"All categories":c}</option>)}</select><button type="button" className={styles.clear} onClick={clear}><X size={17}/> Clear selection</button></section>
  <section className={styles.panel}><div className={styles.panelHead}><div><strong>{Object.keys(selected).length} products selected</strong><span>{labels.length.toLocaleString()} total labels</span></div><button type="button" disabled={!labels.length} onClick={showPreview}><Printer size={18}/> Preview {labels.length?`(${labels.length})`:""}</button></div>
   <div className={styles.tableWrap}><table><thead><tr><th className={styles.check}>Print</th><th>Code</th><th>Product</th><th>Category</th><th>Stock</th><th className={styles.qty}>Labels to Print</th></tr></thead><tbody>{filtered.map(p=>{const on=Boolean(selected[p.id]);return <tr key={p.id} className={on?styles.selected:""}><td className={styles.check}><button type="button" className={styles.checkBtn} onClick={()=>toggle(p)} aria-label={on?"Remove":"Select"}>{on?<CheckSquare size={22}/>:<Square size={22}/>}</button></td><td>{p.productCode}</td><td><strong>{p.productName}</strong></td><td>{p.categoryName}</td><td>{p.stock}</td><td className={styles.qty}>{on?<input type="number" min="1" step="1" value={selected[p.id]} onChange={e=>qty(p.id,Number(e.target.value))}/>:<span>—</span>}</td></tr>})}</tbody></table>{filtered.length===0?<div className={styles.empty}>No matching products.</div>:null}</div>
  </section>
  {preview&&labels.length>0?<section id="print-preview" className={styles.preview}><div className={styles.printToolbar}><div><strong>{labels.length.toLocaleString()} labels · {totalPages} sheet{totalPages===1?"":"s"}</strong><span>65 compact labels per A4 sheet (5 × 13). Print smaller batches for reliable large jobs.</span></div><label>From <input type="number" min="1" max={totalPages} value={fromPage} onChange={e=>setFromPage(Number(e.target.value))}/></label><label>To <input type="number" min="1" max={totalPages} value={toPage} onChange={e=>setToPage(Number(e.target.value))}/></label><button type="button" onClick={print}><Printer size={18}/> Print Pages {fromPage}–{toPage}</button></div>
   <div className={styles.pages}>{pages.map((page,pi)=><section key={pi} className={`${styles.printPage} ${pi+1<fromPage||pi+1>toPage?styles.skipPrint:""}`}><div className={styles.pageNo}>Page {pi+1} of {totalPages}</div><div className={styles.grid}>{page.map((x,i)=><article className={styles.label} key={`${x.id}-${pi}-${i}`}><div className={styles.shop}>KL MOTOR SHOP</div><div className={styles.labelBody}><div className={styles.qr}><QRCodeSVG value={x.barcode} size={256} level="M" marginSize={2}/></div><div className={styles.info}><div className={styles.name}>{x.productName}</div><div className={styles.price}>{peso(x.sellingPrice)}</div><div className={styles.code}>{x.productCode}</div></div></div></article>)}</div></section>)}</div>
  </section>:null}
 </main>
}
