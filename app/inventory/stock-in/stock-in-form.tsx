"use client";

import { AlertTriangle, Check, PackageSearch, Plus, Search, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createQuickCategory, createQuickProduct, createStockIn, type QuickCategoryActionState, type QuickProductActionState, type StockInActionState } from "./actions";
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
type CategoryOption = { id: number; category_name: string };
type Line = { key: number; productId: string; quantity: string; unitCost: string; sellingPrice: string };

const initialState: StockInActionState = { error: "" };
const initialQuickProductState: QuickProductActionState = { error: "" };
const initialQuickCategoryState: QuickCategoryActionState = { error: "" };

export default function StockInForm({ products, suppliers, categories, canEditSellingPrice }: { products: ProductOption[]; suppliers: SupplierOption[]; categories: CategoryOption[]; canEditSellingPrice: boolean }) {
  const [state, formAction, pending] = useActionState(createStockIn, initialState);
  const [quickState, quickProductAction, quickPending] = useActionState(createQuickProduct, initialQuickProductState);
  const [categoryState, quickCategoryAction, categoryPending] = useActionState(createQuickCategory, initialQuickCategoryState);
  const [availableProducts, setAvailableProducts] = useState<ProductOption[]>(products);
  const [createOpen, setCreateOpen] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>(categories);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [clientError, setClientError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: 1, productId: "", quantity: "1", unitCost: "", sellingPrice: "" },
  ]);
  const searchRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(() => new Map(availableProducts.map((product) => [String(product.id), product])), [availableProducts]);
  const selectedProductIds = useMemo(() => new Set(lines.map((line) => line.productId).filter(Boolean)), [lines]);

  const filteredProducts = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    return availableProducts.filter((product) => {
      if (!query) return true;
      return `${product.product_code} ${product.product_name} ${product.unit}`.toLowerCase().includes(query);
    });
  }, [pickerSearch, availableProducts]);

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
  useEffect(() => {
    if (!quickState.product) return;
    const created = quickState.product;
    setAvailableProducts((current) => current.some((item) => item.id === created.id) ? current : [...current, created].sort((a, b) => a.product_name.localeCompare(b.product_name)));
    addProduct(created);
    setCreateOpen(false);
  // quickState changes only after the quick-create server action finishes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickState.product]);

  useEffect(() => {
    if (!categoryState.category) return;
    const created = categoryState.category;
    setAvailableCategories((current) => current.some((item) => item.id === created.id) ? current : [...current, created].sort((a, b) => a.category_name.localeCompare(b.category_name)));
    setSelectedCategoryId(String(created.id));
    setCategorySearch(created.category_name);
    setCategoryOpen(false);
  }, [categoryState.category]);

  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    return availableCategories.filter((category) => !query || category.category_name.toLowerCase().includes(query));
  }, [availableCategories, categorySearch]);

  const selectedCategory = availableCategories.find((category) => String(category.id) === selectedCategoryId);
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
                    <td><input name="selling_price" type="number" min="0" step="0.01" required={Boolean(line.productId)} disabled={!line.productId} readOnly={!canEditSellingPrice} title={canEditSellingPrice ? "Set selling price" : "Selling price is controlled by Owner/Admin"} value={line.sellingPrice} onChange={(event) => updateLine(line.key, { sellingPrice: event.target.value })} />{line.productId && !canEditSellingPrice ? <small className={styles.priceReadOnly}>Owner/Admin controlled</small> : null}</td>
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
            {filteredProducts.length === 0 ? <div className={styles.noResults}><PackageSearch size={28}/><strong>No products found</strong><span>This product may not be registered yet.</span><button type="button" className={styles.createProductButton} onClick={() => setCreateOpen(true)}><Plus size={16}/> Add New Product</button></div> : filteredProducts.map((product) => {
              const alreadyAdded = selectedProductIds.has(String(product.id));
              return <button key={product.id} type="button" className={styles.productResult} disabled={alreadyAdded} onClick={() => addProduct(product)}>
                <div><strong>{product.product_name}</strong><span>{product.product_code} · {product.unit}</span></div>
                <div className={styles.productResultRight}><span>₱{Number(product.selling_price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>{alreadyAdded ? <small><Check size={14}/> Added</small> : <small>Add</small>}</div>
              </button>;
            })}
          </div>
          <footer className={styles.modalFooter}><span>{filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"} shown</span><div className={styles.modalFooterActions}><button type="button" className={styles.newProductFooterButton} onClick={() => setCreateOpen(true)}><Plus size={15}/> New Product</button><button type="button" onClick={closePicker}>Close</button></div></footer>
        </section>
      </div> : null}

      {categoryCreateOpen ? <div className={`${styles.modalBackdrop} ${styles.categoryModalBackdrop}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCategoryCreateOpen(false); }}>
        <section className={styles.quickCategoryModal} role="dialog" aria-modal="true" aria-label="Create new category">
          <header className={styles.modalHeader}><div><p>Stock In</p><h2>Add New Category</h2></div><button type="button" onClick={() => setCategoryCreateOpen(false)} aria-label="Close new category form"><X size={20}/></button></header>
          <form action={quickCategoryAction} className={styles.quickProductForm}>
            {categoryState.error ? <div className={styles.formError}><AlertTriangle size={18}/><span>{categoryState.error}</span></div> : null}
            <label><span>Category Name <strong>*</strong></span><input name="category_name" maxLength={120} defaultValue={categorySearch} autoFocus required placeholder="Example: Engine Parts" /></label>
            <label><span>Description</span><input name="description" maxLength={255} placeholder="Optional" /></label>
            <footer className={styles.quickActions}><button type="button" onClick={() => setCategoryCreateOpen(false)}>Cancel</button><button type="submit" disabled={categoryPending}>{categoryPending ? "Creating..." : "Create & Select Category"}</button></footer>
          </form>
        </section>
      </div> : null}

      {createOpen ? <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false); }}>
        <section className={styles.quickProductModal} role="dialog" aria-modal="true" aria-label="Create new product">
          <header className={styles.modalHeader}><div><p>Stock In</p><h2>Add New Product</h2></div><button type="button" onClick={() => setCreateOpen(false)} aria-label="Close new product form"><X size={20}/></button></header>
          <form action={quickProductAction} className={styles.quickProductForm}>
            {quickState.error ? <div className={styles.formError}><AlertTriangle size={18}/><span>{quickState.error}</span></div> : null}
            <label><span>Product Name <strong>*</strong></span><input name="product_name" maxLength={180} defaultValue={pickerSearch} autoFocus required placeholder="Example: Brake Shoe" /></label>
            <div className={styles.quickGrid}>
              <label className={styles.categoryField}><span>Category</span><input type="hidden" name="category_id" value={selectedCategoryId} /><div className={styles.categoryCombo}><div className={styles.categorySearchInput}><Search size={16}/><input value={categoryOpen ? categorySearch : (selectedCategory?.category_name ?? categorySearch)} onFocus={() => { setCategoryOpen(true); setCategorySearch(selectedCategory?.category_name ?? ""); }} onChange={(event) => { setCategorySearch(event.target.value); setSelectedCategoryId(""); setCategoryOpen(true); }} placeholder="Search category..." autoComplete="off" /></div>{categoryOpen ? <div className={styles.categoryDropdown}><button type="button" className={styles.categoryOption} onClick={() => { setSelectedCategoryId(""); setCategorySearch(""); setCategoryOpen(false); }}>No category</button>{filteredCategories.map((category) => <button key={category.id} type="button" className={styles.categoryOption} onClick={() => { setSelectedCategoryId(String(category.id)); setCategorySearch(category.category_name); setCategoryOpen(false); }}>{category.category_name}{String(category.id) === selectedCategoryId ? <Check size={14}/> : null}</button>)}{filteredCategories.length === 0 && categorySearch.trim() ? <div className={styles.categoryNoMatch}><span>No matching category.</span><button type="button" onClick={() => { setCategoryOpen(false); setCategoryCreateOpen(true); }}><Plus size={14}/> Add “{categorySearch.trim()}”</button></div> : null}</div> : null}</div><button type="button" className={styles.addCategoryInline} onClick={() => { setCategoryOpen(false); setCategoryCreateOpen(true); }}><Plus size={14}/> {categorySearch.trim() && filteredCategories.length === 0 ? `New category: ${categorySearch.trim()}` : "Type to search or add a new category below"}</button></label>
              <label><span>Unit <strong>*</strong></span><select name="unit" defaultValue="PCS"><option>PCS</option><option>BOTTLE</option><option>SET</option><option>PAIR</option><option>BOX</option><option>PACK</option><option>LITER</option></select></label>
            </div>
            <label><span>QR Code / Existing Code</span><input name="barcode" maxLength={100} placeholder="Optional" /><small>Leave blank if this new product does not already have a QR value.</small></label>
            <div className={styles.quickInfo}>The product will be created with zero stock. Enter its quantity and purchase cost in the Stock In row. Selling price can only be set or changed by Owner/Admin.</div>
            <footer className={styles.quickActions}><button type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button type="submit" disabled={quickPending}>{quickPending ? "Creating..." : "Create & Add to Stock In"}</button></footer>
          </form>
        </section>
      </div> : null}
    </>
  );
}
