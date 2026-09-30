"use client";

import { AlertTriangle, Check, PackageSearch, Plus, Search, Trash2, X } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import { createStockIn, type StockInActionState } from "./actions";
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

const initialState: StockInActionState = { error: "" };

export default function StockInForm({ products, suppliers }: { products: ProductOption[]; suppliers: SupplierOption[] }) {
  const [state, formAction, pending] = useActionState(createStockIn, initialState);
  const [nextKey, setNextKey] = useState(2);
  const [clientError, setClientError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: 1, productId: "", quantity: "1", unitCost: "", sellingPrice: "" },
  ]);
  const searchRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(() => new Map(products.map((product) => [String(product.id), product])), [products]);
  const selectedProductIds = useMemo(() => new Set(lines.map((line) => line.productId).filter(Boolean)), [lines]);

  const filteredProducts = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    return products.filter((product) => {
      if (!query) return true;
      return `${product.product_code} ${product.product_name} ${product.unit}`.toLowerCase().includes(query);
    });
  }, [pickerSearch, products]);

  function openPicker() {
    setClientError("");
    setPickerSearch("");
    setPickerOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function closePicker() {
    setPickerOpen(false);
    setPickerSearch("");
  }

  function addProduct(product: ProductOption) {
    const productId = String(product.id);
    if (selectedProductIds.has(productId)) {
      setClientError(`${product.product_name} is already in this Stock In. Please update its existing row instead.`);
      closePicker();
      return;
    }

    const emptyLine = lines.find((line) => !line.productId);
    if (emptyLine) {
      setLines((current) => current.map((line) => line.key === emptyLine.key ? {
        ...line,
        productId,
        quantity: line.quantity || "1",
        unitCost: String(Number(product.cost_price)),
        sellingPrice: String(Number(product.selling_price)),
      } : line));
    } else {
      setLines((current) => [...current, {
        key: nextKey,
        productId,
        quantity: "1",
        unitCost: String(Number(product.cost_price)),
        sellingPrice: String(Number(product.selling_price)),
      }]);
      setNextKey((value) => value + 1);
    }
    setClientError("");
    closePicker();
  }

  function removeLine(key: number) {
    setClientError("");
    setLines((current) => {
      const remaining = current.filter((line) => line.key !== key);
      return remaining.length ? remaining : [{ key: nextKey, productId: "", quantity: "1", unitCost: "", sellingPrice: "" }];
    });
    if (lines.length === 1) setNextKey((value) => value + 1);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setClientError("");
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function validateBeforeSubmit(event: React.FormEvent<HTMLFormElement>) {
    const completedLines = lines.filter((line) => line.productId);
    if (completedLines.length === 0) {
      event.preventDefault();
      setClientError("Add at least one product before saving this Stock In.");
      return;
    }
    if (completedLines.length !== lines.length) {
      event.preventDefault();
      setClientError("There is an empty product row. Select a product or remove the empty row before saving.");
      return;
    }
    const ids = completedLines.map((line) => line.productId);
    if (new Set(ids).size !== ids.length) {
      event.preventDefault();
      setClientError("A product was added more than once. Please remove the duplicate before saving.");
    }
  }

  const totalCost = lines.reduce((sum, line) => {
    const quantity = Number(line.quantity || 0);
    const cost = Number(line.unitCost || 0);
    return sum + (Number.isFinite(quantity * cost) ? quantity * cost : 0);
  }, 0);

  const totalLabels = lines.reduce((sum, line) => sum + (line.productId ? Math.max(0, Number(line.quantity || 0) || 0) : 0), 0);
  const visibleError = clientError || state.error;

  return (
    <>
      <form action={formAction} onSubmit={validateBeforeSubmit} className={styles.form}>
        {visibleError ? <div className={styles.formError}><AlertTriangle size={19} /><span>{visibleError}</span></div> : null}

        <section className={styles.card}>
          <header><div><p>Delivery information</p><h2>Stock-in header</h2></div></header>
          <div className={styles.grid}>
            <label><span>Supplier</span><select name="supplier_id" defaultValue=""><option value="">No supplier / walk-in delivery</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label>
            <label><span>Supplier invoice / reference</span><input name="supplier_reference" maxLength={100} placeholder="e.g. INV-10284" /></label>
            <label className={styles.full}><span>Remarks</span><textarea name="remarks" rows={3} placeholder="Optional delivery notes" /></label>
          </div>
        </section>

        <section className={styles.card}>
          <header className={styles.itemsHeader}>
            <div><p>Received products</p><h2>Stock-in items</h2><span className={styles.headerHint}>Search products by code or name instead of scrolling through a long list.</span></div>
            <button type="button" className={styles.addLine} onClick={openPicker}><Plus size={17} /> Add Product</button>
          </header>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Product</th><th>Qty</th><th>Unit Cost</th><th>Selling Price</th><th>Line Cost</th><th></th></tr></thead>
              <tbody>
                {lines.map((line) => {
                  const product = productMap.get(line.productId);
                  const lineCost = (Number(line.quantity || 0) || 0) * (Number(line.unitCost || 0) || 0);
                  return <tr key={line.key}>
                    <td className={styles.productCell}>
                      <input type="hidden" name="product_id" value={line.productId} />
                      {product ? <div className={styles.selectedProduct}><div><strong>{product.product_name}</strong><span>{product.product_code} · {product.unit}</span></div><button type="button" onClick={openPicker} className={styles.changeProduct} title="Add another product"><Plus size={15}/></button></div> : <button type="button" className={styles.selectProductButton} onClick={openPicker}><PackageSearch size={18}/><span><strong>Select product</strong><small>Search by product code or name</small></span></button>}
                    </td>
                    <td><input name="quantity" type="number" min="1" step="1" required={Boolean(line.productId)} disabled={!line.productId} value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></td>
                    <td><input name="unit_cost" type="number" min="0" step="0.01" required={Boolean(line.productId)} disabled={!line.productId} value={line.unitCost} onChange={(event) => updateLine(line.key, { unitCost: event.target.value })} /></td>
                    <td><input name="selling_price" type="number" min="0" step="0.01" required={Boolean(line.productId)} disabled={!line.productId} value={line.sellingPrice} onChange={(event) => updateLine(line.key, { sellingPrice: event.target.value })} /></td>
                    <td className={styles.money}>₱{lineCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td><button type="button" className={styles.removeButton} onClick={() => removeLine(line.key)} aria-label="Remove line"><Trash2 size={17} /></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.bottomAddWrap}><button type="button" className={styles.bottomAdd} onClick={openPicker}><Plus size={18}/> Add Another Product</button></div>
          <div className={styles.summary}><div><span>Products</span><strong>{lines.filter((line) => line.productId).length}</strong></div><div><span>Total delivery cost</span><strong>₱{totalCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div><div><span>QR stickers after save</span><strong>{totalLabels}</strong></div></div>
        </section>

        <div className={styles.actions}><a href="/inventory/stock-in">Cancel</a><button type="submit" disabled={pending}>{pending ? "Saving Stock In..." : "Save Stock In & Generate QR Codes"}</button></div>
      </form>

      {pickerOpen ? <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePicker(); }}>
        <section className={styles.productModal} role="dialog" aria-modal="true" aria-label="Select product">
          <header className={styles.modalHeader}><div><p>Add to Stock In</p><h2>Select Product</h2></div><button type="button" onClick={closePicker} aria-label="Close product selector"><X size={20}/></button></header>
          <div className={styles.searchBox}><Search size={19}/><input ref={searchRef} value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search product name, code, or unit..." /></div>
          <div className={styles.productResults}>
            {filteredProducts.length === 0 ? <div className={styles.noResults}><PackageSearch size={28}/><strong>No products found</strong><span>Try a different product name or code.</span></div> : filteredProducts.map((product) => {
              const alreadyAdded = selectedProductIds.has(String(product.id));
              return <button key={product.id} type="button" className={styles.productResult} disabled={alreadyAdded} onClick={() => addProduct(product)}>
                <div><strong>{product.product_name}</strong><span>{product.product_code} · {product.unit}</span></div>
                <div className={styles.productResultRight}><span>₱{Number(product.selling_price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>{alreadyAdded ? <small><Check size={14}/> Added</small> : <small>Add</small>}</div>
              </button>;
            })}
          </div>
          <footer className={styles.modalFooter}><span>{filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} shown</span><button type="button" onClick={closePicker}>Close</button></footer>
        </section>
      </div> : null}
    </>
  );
}
