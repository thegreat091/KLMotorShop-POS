"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import styles from "./job-orders.module.css";

type Option = { value: string; label: string };

export default function SearchableSelect({ name, value, onChange, options, placeholder, disabled=false, required=false, allowEmpty=false, emptyLabel="Unassigned" }: {
  name?: string; value: string; onChange: (value:string)=>void; options: Option[]; placeholder: string; disabled?: boolean; required?: boolean; allowEmpty?: boolean; emptyLabel?: string;
}) {
  const [open,setOpen]=useState(false); const [query,setQuery]=useState(""); const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{ const close=(e:MouseEvent)=>{ if(root.current&&!root.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown",close); return()=>document.removeEventListener("mousedown",close); },[]);
  const selected=options.find(o=>o.value===value);
  const filtered=useMemo(()=>{ const q=query.trim().toLowerCase(); return q?options.filter(o=>o.label.toLowerCase().includes(q)):options; },[options,query]);
  function choose(v:string){ onChange(v); setOpen(false); setQuery(""); }
  return <div className={styles.searchSelect} ref={root}>
    {name?<input type="hidden" name={name} value={value} required={required}/>:null}
    <button type="button" className={styles.searchSelectButton} disabled={disabled} onClick={()=>{setOpen(v=>!v);setQuery("");}} aria-expanded={open}>
      <span className={!selected&&!value?styles.searchSelectPlaceholder:""}>{selected?.label ?? (value===""&&allowEmpty?emptyLabel:placeholder)}</span><ChevronDown size={17}/>
    </button>
    {open?<div className={styles.searchSelectMenu}>
      <div className={styles.searchSelectInputWrap}><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Type to search..." onKeyDown={e=>{if(e.key==="Escape")setOpen(false)}}/>{query?<button type="button" onClick={()=>setQuery("")}><X size={14}/></button>:null}</div>
      <div className={styles.searchSelectOptions}>
        {allowEmpty?<button type="button" className={styles.searchSelectOption} onClick={()=>choose("")}><span>{emptyLabel}</span>{value===""?<Check size={16}/>:null}</button>:null}
        {filtered.map(o=><button type="button" key={o.value} className={styles.searchSelectOption} onClick={()=>choose(o.value)}><span>{o.label}</span>{value===o.value?<Check size={16}/>:null}</button>)}
        {filtered.length===0?<div className={styles.searchSelectEmpty}>No matching record found.</div>:null}
      </div>
    </div>:null}
  </div>;
}
