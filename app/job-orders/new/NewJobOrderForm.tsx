"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createJobOrder } from "../actions";
import styles from "../job-orders.module.css";

type ClientOption = {
  id: number;
  client_name: string;
};

type MotorcycleOption = {
  id: number;
  client_id: number;
  plate_number: string;
  model_name: string;
};

type MechanicOption = {
  id: number;
  full_name: string;
};

export default function NewJobOrderForm({
  clients,
  motorcycles,
  mechanics,
}: {
  clients: ClientOption[];
  motorcycles: MotorcycleOption[];
  mechanics: MechanicOption[];
}) {
  const [clientId, setClientId] = useState("");
  const [motorcycleId, setMotorcycleId] = useState("");

  const clientMotorcycles = useMemo(() => {
    if (!clientId) return [];
    const selectedClientId = Number(clientId);
    return motorcycles.filter((motorcycle) => motorcycle.client_id === selectedClientId);
  }, [clientId, motorcycles]);

  function handleClientChange(value: string) {
    setClientId(value);
    setMotorcycleId("");
  }

  return (
    <form action={createJobOrder} className={styles.card}>
      <h2>Job information</h2>

      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>Client *</span>
          <select
            name="client_id"
            required
            value={clientId}
            onChange={(event) => handleClientChange(event.target.value)}
          >
            <option value="" disabled>
              Select client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.client_name}
              </option>
            ))}
          </select>
          <small>Add the client first if they are not yet registered.</small>
        </label>

        <label className={styles.field}>
          <span>Motorcycle *</span>
          <select
            name="motorcycle_id"
            required
            value={motorcycleId}
            disabled={!clientId}
            onChange={(event) => setMotorcycleId(event.target.value)}
          >
            <option value="" disabled>
              {!clientId
                ? "Select client first"
                : clientMotorcycles.length === 0
                  ? "No motorcycle registered for this client"
                  : "Select motorcycle"}
            </option>
            {clientMotorcycles.map((motorcycle) => (
              <option key={motorcycle.id} value={motorcycle.id}>
                {motorcycle.plate_number} — {motorcycle.model_name}
              </option>
            ))}
          </select>
          {clientId && clientMotorcycles.length === 0 ? (
            <small>This client has no active motorcycle. Add one in Motorcycles first.</small>
          ) : (
            <small>Only motorcycles registered to the selected client are shown.</small>
          )}
        </label>

        <label className={styles.field}>
          <span>Assigned mechanic</span>
          <select name="assigned_mechanic_id" defaultValue="">
            <option value="">Unassigned</option>
            {mechanics.map((mechanic) => (
              <option key={mechanic.id} value={mechanic.id}>
                {mechanic.full_name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Priority</span>
          <select name="priority" defaultValue="NORMAL">
            <option>LOW</option>
            <option>NORMAL</option>
            <option>HIGH</option>
            <option>EMERGENCY</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Estimated finish</span>
          <input type="datetime-local" name="estimated_finish" />
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          <span>Customer concern *</span>
          <textarea
            name="customer_concern"
            rows={5}
            required
            placeholder="Example: Change oil, engine noise, rear tire worn out..."
          />
        </label>

        <label className={`${styles.field} ${styles.full}`}>
          <span>Remarks</span>
          <textarea
            name="remarks"
            rows={3}
            placeholder="Optional cashier/front desk notes"
          />
        </label>
      </div>

      <div className={styles.actions}>
        <Link className={styles.secondary} href="/job-orders">
          Cancel
        </Link>
        <button
          className={styles.primary}
          type="submit"
          disabled={!clientId || !motorcycleId}
        >
          Create Job Order
        </button>
      </div>
    </form>
  );
}
