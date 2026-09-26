"use client";

import { useState } from "react";
import styles from "../job-orders.module.css";

type Service = { id: number; service_name: string; service_charge: number };

export default function ServiceChargeFields({ services }: { services: Service[] }) {
  const [serviceId, setServiceId] = useState("");
  const selected = services.find((s) => String(s.id) === serviceId);
  const [charge, setCharge] = useState("");

  function selectService(value: string) {
    setServiceId(value);
    const service = services.find((s) => String(s.id) === value);
    setCharge(service ? Number(service.service_charge).toFixed(2) : "");
  }

  return (
    <>
      <label className={styles.field}>
        <span>Service</span>
        <select name="service_id" required value={serviceId} onChange={(e) => selectService(e.target.value)}>
          <option value="" disabled>Select service</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.service_name} — Suggested ₱{Number(s.service_charge).toFixed(2)}</option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>Actual Service Charge</span>
        <input name="service_charge" type="number" min="0" step="0.01" required value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="Enter actual charge" />
        <small>{selected ? `Suggested: ₱${Number(selected.service_charge).toFixed(2)} — editable for discount or higher charge.` : "Select a service to load its suggested price."}</small>
      </label>
    </>
  );
}
