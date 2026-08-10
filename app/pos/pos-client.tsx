"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  Bike,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import { completeProductSale } from "./actions";
import styles from "./pos.module.css";

type Product = {
  id: number;
  product_code: string;
  barcode: string | null;
  product_name: string;
  selling_price: number;
  quantity_on_hand: number;
  unit: string;
};

type Batch = {
  id: number;
  product_id: number;
  batch_number: string;
  barcode: string;
  quantity_remaining: number;
  selling_price: number;
  received_at: string;
};

type Client = {
  id: number;
  client_name: string;
  mobile_number: string | null;
};

type Motorcycle = {
  id: number;
  client_id: number;
  plate_number: string;
  model_name: string;
};

type CartLine = {
  batchId: number;
  productId: number;
  productCode: string;
  productName: string;
  batchNumber: string;
  batchBarcode: string;
  quantity: number;
  available: number;
  unitPrice: number;
};

type JobOrder = {
  id: number;
  job_order_number: string;
  client_id: number | null;
  motorcycle_id: number | null;
  mechanic_name: string | null;
  parts: {
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
  }[];
  services: {
    id: number;
    service_name: string;
    service_charge: number;
    mechanic_name: string | null;
  }[];
};

const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value);

export function PosClient({
  products,
  batches,
  clients,
  motorcycles,
  success,
  error,
  jobOrder,
}: {
  products: Product[];
  batches: Batch[];
  clients: Client[];
  motorcycles: Motorcycle[];
  success?: string;
  error?: string;
  jobOrder: JobOrder | null;
}) {
  const [scan, setScan] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState(
    jobOrder?.client_id ? String(jobOrder.client_id) : "",
  );
  const [motorcycleId, setMotorcycleId] = useState(
    jobOrder?.motorcycle_id ? String(jobOrder.motorcycle_id) : "",
  );
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [tendered, setTendered] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const allocatedByBatch = useMemo(
    () => new Map(cart.map((line) => [line.batchId, line.quantity])),
    [cart],
  );

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!jobOrder || cart.length) return;

    const lines: CartLine[] = [];

    for (const part of jobOrder.parts) {
      let needed = part.quantity;
      const product = productMap.get(part.product_id);
      if (!product) continue;

      const availableBatches = batches
        .filter(
          (batch) =>
            batch.product_id === part.product_id &&
            batch.quantity_remaining > 0,
        )
        .sort((a, b) => a.received_at.localeCompare(b.received_at));

      for (const batch of availableBatches) {
        if (needed <= 0) break;
        const quantity = Math.min(needed, batch.quantity_remaining);

        lines.push({
          batchId: batch.id,
          productId: product.id,
          productCode: product.product_code,
          productName: product.product_name,
          batchNumber: batch.batch_number,
          batchBarcode: batch.barcode,
          quantity,
          available: batch.quantity_remaining,
          unitPrice: part.unit_price,
        });

        needed -= quantity;
      }

      if (needed > 0) {
        setMessage(
          `Insufficient stock for ${part.product_name}. Need ${needed} more.`,
        );
      }
    }

    setCart(lines);
  }, [jobOrder, batches, productMap, cart.length]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return products
      .filter(
        (product) =>
          product.quantity_on_hand > 0 &&
          (!term ||
            product.product_name.toLowerCase().includes(term) ||
            product.product_code.toLowerCase().includes(term) ||
            (product.barcode ?? "").includes(term)),
      )
      .slice(0, 18);
  }, [products, search]);

  const addBatch = (batch: Batch, quantity = 1, price?: number) => {
    const product = productMap.get(batch.product_id);
    if (!product) return;

    setCart((previous) => {
      const index = previous.findIndex((line) => line.batchId === batch.id);

      if (index >= 0) {
        const next = [...previous];
        next[index] = {
          ...next[index],
          quantity: Math.min(
            next[index].quantity + quantity,
            next[index].available,
          ),
        };
        return next;
      }

      return [
        ...previous,
        {
          batchId: batch.id,
          productId: product.id,
          productCode: product.product_code,
          productName: product.product_name,
          batchNumber: batch.batch_number,
          batchBarcode: batch.barcode,
          quantity: Math.min(quantity, batch.quantity_remaining),
          available: batch.quantity_remaining,
          unitPrice:
            price ??
            (batch.selling_price > 0
              ? batch.selling_price
              : product.selling_price),
        },
      ];
    });
  };

  const scanCode = () => {
    if (jobOrder) {
      setMessage(
        "This POS was loaded from a Job Order. Parts are locked to that Job Order.",
      );
      setScan("");
      return;
    }

    const code = scan.trim();
    if (!code) return;

    const exactBatch = batches.find((batch) => batch.barcode === code);

    if (exactBatch) {
      addBatch(exactBatch);
    } else {
      const product = products.find((item) => item.barcode === code);

      if (product) {
        const batch = batches.find(
          (item) =>
            item.product_id === product.id &&
            item.quantity_remaining > (allocatedByBatch.get(item.id) ?? 0),
        );

        if (batch) addBatch(batch);
        else setMessage("No available batch for that product.");
      } else {
        setMessage("Barcode not found.");
      }
    }

    setScan("");
    setTimeout(() => scanRef.current?.focus(), 0);
  };

  const addProduct = (product: Product) => {
    if (jobOrder) return;

    const batch = batches.find(
      (item) =>
        item.product_id === product.id &&
        item.quantity_remaining > (allocatedByBatch.get(item.id) ?? 0),
    );

    if (batch) addBatch(batch);
    else setMessage("No available batch for that product.");
  };

  const productSubtotal = cart.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const serviceSubtotal =
    jobOrder?.services.reduce(
      (sum, service) => sum + service.service_charge,
      0,
    ) ?? 0;
  const subtotal = productSubtotal + serviceSubtotal;
  const discountAmount = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountAmount);
  const cash = Number(tendered) || 0;
  const change = paymentMethod === "CASH" ? Math.max(0, cash - total) : 0;
  const paymentIsEnough = total <= 0 || cash >= total;
  const amountStillDue = Math.max(0, total - cash);

  const filteredMotorcycles = motorcycles.filter((motorcycle) => {
    if (jobOrder && motorcycleId && motorcycle.id === Number(motorcycleId)) {
      return true;
    }

    return !clientId || motorcycle.client_id === Number(clientId);
  });

  const selectedClient = clients.find(
    (client) => client.id === Number(clientId),
  );
  const selectedMotorcycle = motorcycles.find(
    (motorcycle) => motorcycle.id === Number(motorcycleId),
  );

  return (
    <div className={styles.posBody}>
      {jobOrder ? (
        <div className={`${styles.notice} ${styles.noticeSuccess}`}>
          <strong>Paying Job Order {jobOrder.job_order_number}</strong>
          <span>
            {selectedClient?.client_name ?? "Customer"}
            {selectedMotorcycle
              ? ` • ${selectedMotorcycle.model_name} / ${selectedMotorcycle.plate_number}`
              : ""}
            {jobOrder.mechanic_name
              ? ` • Mechanic: ${jobOrder.mechanic_name}`
              : ""}
          </span>
        </div>
      ) : null}

      {success ? (
        <div className={`${styles.notice} ${styles.noticeSuccess}`}>
          {success}
        </div>
      ) : null}

      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div>
      ) : null}

      {message ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          {message}
        </div>
      ) : null}

      <div className={styles.workspace}>
        <section className={styles.catalogPanel}>
          <div className={styles.scanBox}>
            <label>
              <Barcode size={18} /> Barcode Scanner
            </label>
            <div className={styles.scanRow}>
              <input
                ref={scanRef}
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") scanCode();
                }}
                placeholder="Scan barcode here..."
                disabled={!!jobOrder}
              />
              <button
                type="button"
                onClick={scanCode}
                disabled={!!jobOrder}
              >
                Add
              </button>
            </div>
            <small>
              {jobOrder
                ? "Parts are locked because this sale came from a Job Order."
                : "KL batch barcode and manufacturer barcode are both supported."}
            </small>
          </div>

          <div className={styles.searchBox}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product name, code or barcode"
              disabled={!!jobOrder}
            />
          </div>

          <div className={styles.productGrid}>
            {!jobOrder ? (
              filteredProducts.length ? (
                filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={styles.productCard}
                    onClick={() => addProduct(product)}
                  >
                    <span className={styles.productCode}>
                      {product.product_code}
                    </span>
                    <strong>{product.product_name}</strong>
                    <span>{peso(product.selling_price)}</span>
                    <small>
                      Stock: {product.quantity_on_hand} {product.unit}
                    </small>
                  </button>
                ))
              ) : (
                <div className={styles.emptyProducts}>No products found.</div>
              )
            ) : (
              jobOrder.parts.map((part, index) => (
                <div key={`${part.product_id}-${index}`} className={styles.productCard}>
                  <span className={styles.productCode}>JOB ORDER PART</span>
                  <strong>{part.product_name}</strong>
                  <span>{peso(part.unit_price)}</span>
                  <small>Qty: {part.quantity}</small>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.cartPanel}>
          <div className={styles.cartHeader}>
            <div>
              <ShoppingCart size={19} />
              <h2>Current Sale</h2>
            </div>
            <span>
              {cart.reduce((sum, line) => sum + line.quantity, 0)} item(s)
            </span>
          </div>

          <div className={styles.cartLines}>
            {cart.length === 0 && !jobOrder?.services.length ? (
              <div className={styles.emptyCart}>
                <ShoppingCart size={42} />
                <strong>Your cart is empty</strong>
                <span>Scan a barcode or select a product.</span>
              </div>
            ) : null}

            {cart.map((line, index) => (
              <div className={styles.cartLine} key={line.batchId}>
                <div className={styles.cartInfo}>
                  <strong>{line.productName}</strong>
                  <span>{line.productCode}</span>
                  <small>Batch: {line.batchNumber}</small>
                </div>

                <div className={styles.qtyControl}>
                  <button
                    type="button"
                    disabled={!!jobOrder}
                    onClick={() =>
                      setCart((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                quantity: Math.max(1, item.quantity - 1),
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <Minus size={13} />
                  </button>
                  <strong>{line.quantity}</strong>
                  <button
                    type="button"
                    disabled={!!jobOrder}
                    onClick={() =>
                      setCart((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                quantity: Math.min(
                                  item.available,
                                  item.quantity + 1,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <strong className={styles.lineTotal}>
                  {peso(line.quantity * line.unitPrice)}
                </strong>

                {!jobOrder ? (
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() =>
                      setCart((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}

            {jobOrder?.services.length ? (
              <div className={styles.serviceSection}>
                <div className={styles.serviceTitle}>
                  <Wrench size={16} /> Services
                </div>
                {jobOrder.services.map((service) => (
                  <div className={styles.serviceLine} key={service.id}>
                    <div>
                      <strong>{service.service_name}</strong>
                      <small>
                        {service.mechanic_name ??
                          jobOrder.mechanic_name ??
                          "Assigned mechanic"}
                      </small>
                    </div>
                    <strong>{peso(service.service_charge)}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.paymentPanel}>
          <form action={completeProductSale} className={styles.paymentForm}>
            <input
              type="hidden"
              name="cart_json"
              value={JSON.stringify(
                cart.map((line) => ({
                  batchId: line.batchId,
                  quantity: line.quantity,
                })),
              )}
            />
            <input
              type="hidden"
              name="job_order_id"
              value={jobOrder?.id ?? ""}
            />

            <div className={styles.paymentHeading}>
              <h2>Checkout</h2>
              <span>{jobOrder ? "Job Order Payment" : "Direct Sale"}</span>
            </div>

            <div className={styles.customerBlock}>
              <div className={styles.blockTitle}>
                <UserRound size={15} /> Customer
              </div>
              <label>
                Client
                <select
                  name="client_id"
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                    setMotorcycleId("");
                  }}
                  disabled={!!jobOrder}
                >
                  <option value="">Walk-in Customer</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.client_name}
                    </option>
                  ))}
                </select>
                {jobOrder ? (
                  <input type="hidden" name="client_id" value={clientId} />
                ) : null}
              </label>

              <label>
                <span className={styles.inlineLabel}>
                  <Bike size={13} /> Motorcycle
                </span>
                <select
                  name="motorcycle_id"
                  value={motorcycleId}
                  onChange={(event) => setMotorcycleId(event.target.value)}
                  disabled={!!jobOrder}
                >
                  <option value="">None</option>
                  {filteredMotorcycles.map((motorcycle) => (
                    <option key={motorcycle.id} value={motorcycle.id}>
                      {motorcycle.plate_number} • {motorcycle.model_name}
                    </option>
                  ))}
                </select>
                {jobOrder ? (
                  <input
                    type="hidden"
                    name="motorcycle_id"
                    value={motorcycleId}
                  />
                ) : null}
              </label>
            </div>

            <div className={styles.totals}>
              <div>
                <span>Products</span>
                <strong>{peso(productSubtotal)}</strong>
              </div>
              {jobOrder ? (
                <div>
                  <span>Services</span>
                  <strong>{peso(serviceSubtotal)}</strong>
                </div>
              ) : null}
              <div>
                <span>Subtotal</span>
                <strong>{peso(subtotal)}</strong>
              </div>
            </div>

            <label>
              Discount
              <input
                name="discount_amount"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </label>

            <label>
              Payment Method
              <select
                name="payment_method"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="GCASH">GCash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label>
              Amount Tendered
              <input
                name="amount_tendered"
                type="number"
                min="0"
                step="0.01"
                value={tendered}
                onChange={(event) => setTendered(event.target.value)}
              />
            </label>

            <label>
              Remarks
              <textarea name="remarks" rows={2} />
            </label>

            <div className={styles.grandTotal}>
              <span>Total</span>
              <strong>{peso(total)}</strong>
            </div>

            <div className={styles.changeRow}>
              <span>{paymentIsEnough ? "Change" : "Amount Still Due"}</span>
              <strong>{peso(paymentIsEnough ? change : amountStillDue)}</strong>
            </div>

            {!paymentIsEnough && total > 0 ? (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                Payment is incomplete. Enter at least {peso(total)} before completing the sale.
              </div>
            ) : null}

            <button
              className={styles.completeButton}
              disabled={(cart.length === 0 && serviceSubtotal === 0) || !paymentIsEnough}
            >
              Complete Sale
            </button>

            <div className={styles.checkoutHint}>
              Stock and Job Order status are finalized only after successful
              payment.
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
