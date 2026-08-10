"use client";

import { useMemo, useState } from "react";
import { createInventoryAdjustment } from "../actions";
import styles from "../stock-adjustments.module.css";

type BatchOption = {
  id: number;
  productCode: string;
  productName: string;
  batchNumber: string;
  barcode: string;
  remaining: number;
  unit: string;
  status: string;
};

export default function AdjustmentForm({ batches }: { batches: BatchOption[] }) {
  const [transactionType, setTransactionType] = useState("STOCK_OUT");
  const [batchId, setBatchId] = useState("");
  const selected = useMemo(
    () => batches.find((batch) => String(batch.id) === batchId),
    [batchId, batches],
  );

  const isIncrease = transactionType === "ADJUSTMENT_IN";

  return (
    <form action={createInventoryAdjustment} className={styles.formCard}>
      <div className={styles.formGrid}>
        <label>
          <span>Transaction Type *</span>
          <select
            name="transaction_type"
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value)}
            required
          >
            <option value="STOCK_OUT">Stock Out</option>
            <option value="ADJUSTMENT_OUT">Adjustment Out</option>
            <option value="ADJUSTMENT_IN">Adjustment In</option>
          </select>
          <small>
            {transactionType === "STOCK_OUT"
              ? "Use for damaged, expired, shop-use, or other non-sale releases."
              : transactionType === "ADJUSTMENT_OUT"
                ? "Use when physical stock is lower than the system quantity."
                : "Use when physical stock is higher than the system quantity."}
          </small>
        </label>

        <label>
          <span>Product Batch *</span>
          <select
            name="batch_id"
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
            required
          >
            <option value="">Select product / batch</option>
            {batches.map((batch) => (
              <option
                key={batch.id}
                value={batch.id}
                disabled={!isIncrease && batch.remaining <= 0}
              >
                {batch.productCode} — {batch.productName} — {batch.batchNumber} — {batch.remaining} {batch.unit} left
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <div className={styles.batchInfo}>
            <div><span>Product</span><strong>{selected.productName}</strong></div>
            <div><span>Batch</span><strong>{selected.batchNumber}</strong></div>
            <div><span>Barcode</span><strong>{selected.barcode}</strong></div>
            <div><span>Remaining</span><strong>{selected.remaining} {selected.unit}</strong></div>
          </div>
        ) : null}

        <label>
          <span>Quantity *</span>
          <input
            name="quantity"
            type="number"
            min="1"
            max={!isIncrease && selected ? selected.remaining : undefined}
            step="1"
            required
          />
        </label>

        <label>
          <span>Reason *</span>
          <input
            name="reason"
            maxLength={160}
            placeholder={
              transactionType === "STOCK_OUT"
                ? "Example: Damaged item / Shop use"
                : transactionType === "ADJUSTMENT_OUT"
                  ? "Example: Physical count shortage"
                  : "Example: Physical count overage"
            }
            required
          />
        </label>

        <label className={styles.fullWidth}>
          <span>Remarks</span>
          <textarea
            name="remarks"
            rows={4}
            maxLength={500}
            placeholder="Optional details about this inventory change"
          />
        </label>
      </div>

      <div className={styles.formActions}>
        <a href="/inventory/stock-adjustments">Cancel</a>
        <button type="submit">Save Inventory Transaction</button>
      </div>
    </form>
  );
}
