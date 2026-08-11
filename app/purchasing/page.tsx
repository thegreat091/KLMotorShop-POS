import {
  ArrowLeft,
  ClipboardList,
  PackageSearch,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function PurchasingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN","OWNER","INVENTORY"].includes(user.role)) redirect("/dashboard");

  const cards = [
    {
      href: "/purchasing/analytics",
      title: "Purchase Analytics",
      description: "Supplier activity, PO value, and receiving progress.",
      icon: Truck,
    },
    {
      href: "/purchasing/reorder",
      title: "Needs Reorder",
      description: "Products at or below their reorder level.",
      icon: PackageSearch,
    },
    {
      href: "/purchasing/purchase-orders/new",
      title: "New Purchase Order",
      description: "Create a supplier purchase order.",
      icon: ShoppingCart,
    },
    {
      href: "/purchasing/purchase-orders",
      title: "Purchase Orders",
      description: "Track ordered and received supplier purchases.",
      icon: ClipboardList,
    },
  ];

  return (
    <main style={{minHeight:"100vh",background:"#eef2f6",padding:24}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <Link href="/dashboard" style={{display:"inline-flex",alignItems:"center",gap:7,textDecoration:"none",color:"#334155",fontWeight:800,marginBottom:16}}>
          <ArrowLeft size={17}/> Dashboard
        </Link>

        <section style={{background:"#fff",border:"1px solid #dbe3ea",borderTop:"4px solid #0f766e",borderRadius:16,padding:22,marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:".14em",color:"#0f766e"}}>Inventory</div>
            <h1 style={{margin:"5px 0",color:"#10213a"}}>Purchasing</h1>
            <p style={{margin:0,color:"#64748b"}}>Reorder products, create supplier purchase orders, and receive stock.</p>
          </div>
          <Truck size={44} color="#0f766e"/>
        </section>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
          {cards.map(card=>{
            const Icon=card.icon;
            return <Link key={card.href} href={card.href} style={{display:"flex",gap:13,padding:18,borderRadius:14,background:"#fff",border:"1px solid #dbe3ea",textDecoration:"none",color:"#10213a"}}>
              <span style={{width:42,height:42,borderRadius:10,display:"grid",placeItems:"center",background:"#ccfbf1",color:"#0f766e"}}><Icon size={21}/></span>
              <span style={{display:"flex",flexDirection:"column",gap:5}}><strong>{card.title}</strong><span style={{fontSize:13,color:"#64748b"}}>{card.description}</span></span>
            </Link>
          })}
        </div>
      </div>
    </main>
  );
}
