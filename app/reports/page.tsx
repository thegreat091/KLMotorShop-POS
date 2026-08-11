
import { ArrowLeft, Boxes, ClipboardList, PackageSearch, ShoppingCart, Truck, UserRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const reports = [
  {href:"/reports/sales",title:"Sales Report",desc:"Sales, payments, products, services, discounts, and estimated gross profit.",icon:ShoppingCart,roles:["ADMIN","OWNER","CASHIER"]},
  {href:"/reports/inventory",title:"Inventory Report",desc:"Current stock, valuation, batches, low stock, and inventory movement summary.",icon:Boxes,roles:["ADMIN","OWNER","INVENTORY"]},
  {href:"/reports/product-sales",title:"Product Sales Report",desc:"Product quantities, revenue, estimated cost, and gross profit.",icon:PackageSearch,roles:["ADMIN","OWNER","CASHIER"]},
  {href:"/reports/job-orders",title:"Job Order Report",desc:"Workshop jobs, statuses, customers, motorcycles, mechanics, parts, and services.",icon:ClipboardList,roles:["ADMIN","OWNER","CASHIER"]},
  {href:"/reports/mechanic-earnings",title:"Mechanic Earnings Report",desc:"Service earnings, mechanic share, owner share, paid and unpaid earnings.",icon:UserRound,roles:["ADMIN","OWNER"]},
  {href:"/reports/supplier-stock-in",title:"Supplier / Stock-In Report",desc:"Supplier purchases, received quantities, costs, and stock-in transaction details.",icon:Truck,roles:["ADMIN","OWNER","INVENTORY"]},
];

export default async function ReportsPage(){
  const user=await getCurrentUser(); if(!user) redirect("/");
  const visible=reports.filter(r=>r.roles.includes(user.role));
  return <main style={{minHeight:"100vh",background:"#eef2f6",padding:"24px"}}>
    <div style={{maxWidth:1200,margin:"0 auto"}}>
      <Link href="/dashboard" style={{display:"inline-flex",alignItems:"center",gap:7,textDecoration:"none",color:"#334155",fontWeight:800,marginBottom:18}}>
        <ArrowLeft size={17}/> Dashboard
      </Link>
      <section style={{background:"#fff",border:"1px solid #dbe3ea",borderRadius:16,padding:"22px",marginBottom:18}}>
        <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".14em",fontWeight:900,color:"#64748b"}}>KL Motor Shop</div>
        <h1 style={{margin:"6px 0",fontSize:30,color:"#10213a"}}>Reports</h1>
        <p style={{margin:0,color:"#64748b"}}>Management and operational reports for sales, inventory, workshop, mechanics, and suppliers.</p>
      </section>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:16}}>
        {visible.map(r=>{const Icon=r.icon;return <Link key={r.href} href={r.href} style={{display:"flex",gap:14,padding:20,borderRadius:14,background:"#fff",border:"1px solid #dbe3ea",color:"#10213a",textDecoration:"none",alignItems:"flex-start"}}>
          <span style={{display:"grid",placeItems:"center",width:42,height:42,borderRadius:10,background:"#ecfdf3",color:"#24764c",flex:"0 0 auto"}}><Icon size={21}/></span>
          <span style={{display:"flex",flexDirection:"column",gap:6}}><strong style={{fontSize:17}}>{r.title}</strong><span style={{fontSize:13,lineHeight:1.45,color:"#64748b"}}>{r.desc}</span></span>
        </Link>})}
      </div>
    </div>
  </main>;
}
