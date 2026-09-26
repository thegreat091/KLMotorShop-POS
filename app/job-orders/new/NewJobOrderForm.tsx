"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Bike, Plus, UserPlus, X } from "lucide-react";
import { createClientFromJobOrder, createJobOrder, createMotorcycleFromJobOrder } from "../actions";
import styles from "../job-orders.module.css";

type ClientOption = { id: number; client_name: string };
type MotorcycleOption = { id: number; client_id: number; plate_number: string; model_name: string };
type MechanicOption = { id: number; full_name: string };
type ModelOption = { id: number; model_name: string };

export default function NewJobOrderForm({ clients, motorcycles, mechanics, models }: {
  clients: ClientOption[];
  motorcycles: MotorcycleOption[];
  mechanics: MechanicOption[];
  models: ModelOption[];
}) {
  const [clientId, setClientId] = useState("");
  const [clientOptions, setClientOptions] = useState(clients);
  const [showAddClient, setShowAddClient] = useState(false);
  const [clientName, setClientName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [clientRemarks, setClientRemarks] = useState("");
  const [clientModalError, setClientModalError] = useState("");
  const [isSavingClient, startSavingClient] = useTransition();
  const [motorcycleId, setMotorcycleId] = useState("");
  const [motorcycleOptions, setMotorcycleOptions] = useState(motorcycles);
  const [showAddMotorcycle, setShowAddMotorcycle] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [modelId, setModelId] = useState("");
  const [motorcycleRemarks, setMotorcycleRemarks] = useState("");
  const [modalError, setModalError] = useState("");
  const [isSavingMotorcycle, startSavingMotorcycle] = useTransition();

  const clientMotorcycles = useMemo(() => {
    if (!clientId) return [];
    return motorcycleOptions.filter((m) => m.client_id === Number(clientId));
  }, [clientId, motorcycleOptions]);

  function handleClientChange(value: string) {
    setClientId(value);
    setMotorcycleId("");
    setShowAddMotorcycle(false);
  }

  function openClientDialog() {
    setClientName(""); setMobileNumber(""); setClientRemarks(""); setClientModalError("");
    setShowAddClient(true);
  }

  function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientModalError("");
    startSavingClient(async () => {
      const result = await createClientFromJobOrder({ clientName, mobileNumber, remarks: clientRemarks });
      if (!result.ok || !result.client) { setClientModalError(result.message); return; }
      setClientOptions((current) => [...current, result.client!].sort((a,b) => a.client_name.localeCompare(b.client_name)));
      setClientId(String(result.client.id));
      setMotorcycleId("");
      setShowAddClient(false);
      setPlateNumber(""); setModelId(""); setMotorcycleRemarks(""); setModalError("");
      setShowAddMotorcycle(true);
    });
  }

  function openMotorcycleDialog() {
    if (!clientId) return;
    setPlateNumber(""); setModelId(""); setMotorcycleRemarks(""); setModalError("");
    setShowAddMotorcycle(true);
  }

  function saveMotorcycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError("");
    startSavingMotorcycle(async () => {
      const result = await createMotorcycleFromJobOrder({
        clientId: Number(clientId), modelId: Number(modelId), plateNumber, remarks: motorcycleRemarks,
      });
      if (!result.ok || !result.motorcycle) { setModalError(result.message); return; }
      setMotorcycleOptions((current) => [...current, result.motorcycle!]);
      setMotorcycleId(String(result.motorcycle.id));
      setShowAddMotorcycle(false);
    });
  }

  const selectedClient = clientOptions.find((c) => c.id === Number(clientId));

  return (
    <>
      <form action={createJobOrder} className={styles.card}>
        <h2>Job information</h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <span>Client *</span>
            <div className={styles.motorcyclePickerRow}>
              <select name="client_id" required value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
                <option value="" disabled>Select client</option>
                {clientOptions.map((client) => <option key={client.id} value={client.id}>{client.client_name}</option>)}
              </select>
              <button type="button" className={styles.addClientButton} onClick={openClientDialog} title="Add a new client without leaving the Job Order">
                <UserPlus size={17}/> Add Client
              </button>
            </div>
            <small>New customer? Add the client here, then register the motorcycle.</small>
          </div>

          <div className={styles.field}>
            <span>Motorcycle *</span>
            <div className={styles.motorcyclePickerRow}>
              <select name="motorcycle_id" required value={motorcycleId} disabled={!clientId} onChange={(e) => setMotorcycleId(e.target.value)}>
                <option value="" disabled>{!clientId ? "Select client first" : clientMotorcycles.length === 0 ? "No motorcycle registered" : "Select motorcycle"}</option>
                {clientMotorcycles.map((m) => <option key={m.id} value={m.id}>{m.plate_number} — {m.model_name}</option>)}
              </select>
              <button type="button" className={styles.addMotorcycleButton} onClick={openMotorcycleDialog} disabled={!clientId} title="Add motorcycle for selected client">
                <Plus size={17}/> Add Motorcycle
              </button>
            </div>
            <small>{clientId ? "Register a motorcycle here without leaving the Job Order." : "Select a client first."}</small>
          </div>

          <label className={styles.field}><span>Assigned mechanic</span><select name="assigned_mechanic_id" defaultValue=""><option value="">Unassigned</option>{mechanics.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
          <label className={styles.field}><span>Priority</span><select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>EMERGENCY</option></select></label>
          <label className={styles.field}><span>Estimated finish</span><input type="datetime-local" name="estimated_finish" /></label>
          <label className={`${styles.field} ${styles.full}`}><span>Customer concern *</span><textarea name="customer_concern" rows={5} required placeholder="Example: Change oil, engine noise, rear tire worn out..." /></label>
          <label className={`${styles.field} ${styles.full}`}><span>Remarks</span><textarea name="remarks" rows={3} placeholder="Optional cashier/front desk notes" /></label>
        </div>
        <div className={styles.actions}><Link className={styles.secondary} href="/job-orders">Cancel</Link><button className={styles.primary} type="submit" disabled={!clientId || !motorcycleId}>Create Job Order</button></div>
      </form>

      {showAddClient ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !isSavingClient) setShowAddClient(false); }}>
          <form className={styles.motorcycleModal} onSubmit={saveClient}>
            <div className={styles.modalHeader}><div className={styles.modalTitle}><span className={styles.modalIcon}><UserPlus size={20}/></span><div><h3>Add New Client</h3><p>Register the customer without leaving the Job Order.</p></div></div><button type="button" className={styles.modalClose} onClick={() => setShowAddClient(false)} disabled={isSavingClient}><X size={20}/></button></div>
            <div className={styles.modalBody}>
              {clientModalError ? <div className={styles.error}>{clientModalError}</div> : null}
              <label className={styles.field}><span>Client Name *</span><input value={clientName} onChange={(e) => setClientName(e.target.value)} maxLength={150} required placeholder="Customer full name" autoFocus /></label>
              <label className={styles.field}><span>Mobile Number</span><input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} maxLength={50} placeholder="Example: 09XXXXXXXXX" /></label>
              <label className={styles.field}><span>Remarks</span><textarea value={clientRemarks} onChange={(e) => setClientRemarks(e.target.value)} rows={3} placeholder="Optional client notes" /></label>
            </div>
            <div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={() => setShowAddClient(false)} disabled={isSavingClient}>Cancel</button><button type="submit" className={styles.primary} disabled={isSavingClient || !clientName.trim()}>{isSavingClient ? "Saving..." : "Save Client & Add Motorcycle"}</button></div>
          </form>
        </div>
      ) : null}

      {showAddMotorcycle ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !isSavingMotorcycle) setShowAddMotorcycle(false); }}>
          <form className={styles.motorcycleModal} onSubmit={saveMotorcycle}>
            <div className={styles.modalHeader}><div className={styles.modalTitle}><span className={styles.modalIcon}><Bike size={20}/></span><div><h3>Add Motorcycle</h3><p>Register it to {selectedClient?.client_name ?? "the selected client"}.</p></div></div><button type="button" className={styles.modalClose} onClick={() => setShowAddMotorcycle(false)} disabled={isSavingMotorcycle}><X size={20}/></button></div>
            <div className={styles.modalBody}>
              {modalError ? <div className={styles.error}>{modalError}</div> : null}
              <label className={styles.field}><span>Client</span><input value={selectedClient?.client_name ?? ""} disabled /></label>
              <label className={styles.field}><span>Plate Number *</span><input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} maxLength={50} required placeholder="Example: ABC 1234" autoFocus /></label>
              <label className={styles.field}><span>Motorcycle Model *</span><select value={modelId} onChange={(e) => setModelId(e.target.value)} required><option value="" disabled>Select motorcycle model</option>{models.map((m) => <option key={m.id} value={m.id}>{m.model_name}</option>)}</select></label>
              <label className={styles.field}><span>Remarks</span><textarea value={motorcycleRemarks} onChange={(e) => setMotorcycleRemarks(e.target.value)} rows={3} placeholder="Optional motorcycle notes" /></label>
            </div>
            <div className={styles.modalActions}><button type="button" className={styles.secondary} onClick={() => setShowAddMotorcycle(false)} disabled={isSavingMotorcycle}>Cancel</button><button type="submit" className={styles.primary} disabled={isSavingMotorcycle || !plateNumber.trim() || !modelId}>{isSavingMotorcycle ? "Saving..." : "Save & Select Motorcycle"}</button></div>
          </form>
        </div>
      ) : null}
    </>
  );
}
