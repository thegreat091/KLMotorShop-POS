"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createStockIn } from "./actions";
import styles from "./stock-in-form.module.css";

type ProductOption = {
  id: number;
  product_code: string;
  product_name: string;
  cost_price: number;
  selling_price: number;
  unit: string;
};

type SupplierOption = { id: number; supplier_name: string };

type Line = { key: number; productId: string; quantity: string; unitCost: string; sellingPrice: string };

export default function StockInForm({ products, suppliers }: { products: ProductOption[]; suppliers: SupplierOption[] }) {
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<Line[]>([
    { key: 1, productId: "", quantity: "1", unitCost: "", sellingPrice: "" },
  ]);

  const productMap = useMemo(() => new Map(products.map((product) => [String(product.id), product])), [products]);

  function addLine() {
    setLines((current) => [...current, { key: nextKey, productId: "", quantity: "1", unitCost: "", sellingPrice: "" }]);
    setNextKey((value) => value + 1);
  }

  function removeLine(key: number) {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.key !== key)));
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectProduct(key: number, productId: string) {
    const product = productMap.get(productId);
    updateLine(key, {
      productId,
      unitCost: product ? String(Number(product.cost_price)) : "",
      sellingPrice: product ? String(Number(product.selling_price)) : "",
    });
  }

  const totalCost = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity || 0);
    const cost = Number(line.unitCost || 0);
    return sum + (Number.isFinite(quantity * cost) ? quantity * cost : 0);
  }, 0);

  const totalLabels = lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0) || 0), 0);

  return (
    <form action={createStockIn} className={styles.form}>
      <section className={styles.card}>
        <header><div><p>Delivery information</p><h2>Stock-in header</h2></div></header>
        <div className={styles.grid}>
          <label><span>Supplier</span><select name="supplier_id" defaultValue=""><option value="">No supplier / walk-in delivery</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label>
          <label><span>Supplier invoice / reference</span><input name="supplier_reference" maxLength={100} placeholder="e.g. INV-10284" /></label>
          <label className={styles.full}><span>Remarks</span><textarea name="remarks" rows={3} placeholder="Optional delivery notes" /></label>
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.itemsHeader}><div><p>Received products</p><h2>Stock-in items</h2></div><button type="button" className={styles.addLine} onClick={addLine}><Plus size={17} /> Add Product</button></header>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Selling Price</th><th>Line Cost</th><th></th></tr></thead>
            <tbody>
              {lines.map((line) => {
                const product = productMap.get(line.productId);
                const lineCost = (Number(line.quantity || 0) || 0) * (Number(line.unitCost || 0) || 0);
                return <tr key={line.key}>
                  <td><select name="product_id" required value={line.productId} onChange={(event) => selectProduct(line.key, event.target.value)}><option value="">Select product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.product_code} — {item.product_name}</option>)}</select>{product ? <small>{product.unit}</small> : null}</td>
                  <td><input name="quantity" type="number" min="1" step="1" required value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></td>
                  <td><input name="unit_cost" type="number" min="0" step="0.01" required value={line.unitCost} onChange={(event) => updateLine(line.key, { unitCost: event.target.value })} /></td>
                  <td><input name="selling_price" type="number" min="0" step="0.01" required value={line.sellingPrice} onChange={(event) => updateLine(line.key, { sellingPrice: event.target.value })} /></td>
                  <td className={styles.money}>₱{lineCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td><button type="button" className={styles.removeButton} onClick={() => removeLine(line.key)} disabled={lines.length === 1} aria-label="Remove line"><Trash2 size={17} /></button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.summary}><div><span>Total delivery cost</span><strong>₱{totalCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div><div><span>Barcode stickers after save</span><strong>{totalLabels}</strong></div></div>
      </section>

      <div className={styles.actions}><a href="/inventory/stock-in">Cancel</a><button type="submit">Save Stock In & Generate Barcodes</button></div>
    </form>
  );
}
