"use client";

import { useState } from "react";
import styles from "../job-orders.module.css";
import SearchableSelect from "../SearchableSelect";

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
        <SearchableSelect
          name="service_id"
          value={serviceId}
          onChange={selectService}
          required
          placeholder="Search service"
          options={services.map((s) => ({
            value: String(s.id),
            label: `${s.service_name} — Suggested ₱${Number(s.service_charge).toFixed(2)}`,
          }))}
        />
      </label>
      <label className={styles.field}>
        <span>Actual Service Charge</span>
        <input name="service_charge" type="number" min="0" step="0.01" required value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="Enter actual charge" />
        <small>{selected ? `Suggested: ₱${Number(selected.service_charge).toFixed(2)} — editable for discount or higher charge.` : "Search and select a service to load its suggested price."}</small>
      </label>
    </>
  );
}
