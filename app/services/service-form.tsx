"use client";

import { useMemo, useState } from "react";
import { Calculator, Save } from "lucide-react";
import styles from "./service-form.module.css";

interface ServiceFormProps {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  initialValues?: {
    serviceName?: string;
    description?: string;
    serviceCharge?: number;
    ownerPercentage?: number;
    mechanicPercentage?: number;
    estimatedMinutes?: number | null;
    isActive?: number;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

export default function ServiceForm({
  action,
  submitLabel,
  initialValues,
}: ServiceFormProps) {
  const [serviceCharge, setServiceCharge] = useState(
    initialValues?.serviceCharge ?? 0,
  );

  const [ownerPercentage, setOwnerPercentage] = useState(
    initialValues?.ownerPercentage ?? 20,
  );

  const [mechanicPercentage, setMechanicPercentage] =
    useState(initialValues?.mechanicPercentage ?? 80);

  const calculation = useMemo(() => {
    const safeCharge = Number.isFinite(serviceCharge)
      ? serviceCharge
      : 0;

    const safeOwnerPercentage = Number.isFinite(
      ownerPercentage,
    )
      ? ownerPercentage
      : 0;

    const safeMechanicPercentage = Number.isFinite(
      mechanicPercentage,
    )
      ? mechanicPercentage
      : 0;

    return {
      ownerAmount:
        safeCharge * (safeOwnerPercentage / 100),
      mechanicAmount:
        safeCharge * (safeMechanicPercentage / 100),
      totalPercentage:
        safeOwnerPercentage + safeMechanicPercentage,
    };
  }, [
    serviceCharge,
    ownerPercentage,
    mechanicPercentage,
  ]);

  const percentageIsValid =
    Number(calculation.totalPercentage.toFixed(2)) === 100;

  return (
    <form action={action} className={styles.formCard}>
      <header>
        <div>
          <p>Service Information</p>
          <h2>Enter service details and labor charge</h2>
        </div>
      </header>

      <div className={styles.formBody}>
        <label className={styles.field}>
          <span>
            Service Name <strong>*</strong>
          </span>

          <input
            type="text"
            name="service_name"
            defaultValue={initialValues?.serviceName ?? ""}
            maxLength={150}
            placeholder="Example: Change Tire"
            autoFocus
            required
          />

          <small>
            The service code will be generated automatically.
          </small>
        </label>

        <label className={styles.field}>
          <span>Description</span>

          <textarea
            name="description"
            defaultValue={initialValues?.description ?? ""}
            rows={4}
            placeholder="Describe what is included in this service."
          />
        </label>

        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>
              Fixed Service Charge <strong>*</strong>
            </span>

            <input
              type="number"
              name="service_charge"
              value={serviceCharge}
              onChange={(event) =>
                setServiceCharge(
                  Number(event.target.value || 0),
                )
              }
              min="0"
              step="0.01"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Estimated Time in Minutes</span>

            <input
              type="number"
              name="estimated_minutes"
              defaultValue={
                initialValues?.estimatedMinutes ?? ""
              }
              min="0"
              step="1"
              placeholder="Example: 30"
            />
          </label>
        </div>

        <section className={styles.commissionBox}>
          <header>
            <div>
              <Calculator size={21} />

              <div>
                <h3>Service charge allocation</h3>
                <p>
                  The owner and mechanic percentages must total
                  exactly 100%.
                </p>
              </div>
            </div>
          </header>

          <div className={styles.twoColumns}>
            <label className={styles.field}>
              <span>Owner Percentage</span>

              <input
                type="number"
                name="owner_percentage"
                value={ownerPercentage}
                onChange={(event) =>
                  setOwnerPercentage(
                    Number(event.target.value || 0),
                  )
                }
                min="0"
                max="100"
                step="0.01"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Mechanic Percentage</span>

              <input
                type="number"
                name="mechanic_percentage"
                value={mechanicPercentage}
                onChange={(event) =>
                  setMechanicPercentage(
                    Number(event.target.value || 0),
                  )
                }
                min="0"
                max="100"
                step="0.01"
                required
              />
            </label>
          </div>

          <div className={styles.calculationGrid}>
            <article>
              <span>Service Charge</span>
              <strong>
                {formatCurrency(serviceCharge)}
              </strong>
            </article>

            <article>
              <span>Owner Share</span>
              <strong>
                {formatCurrency(calculation.ownerAmount)}
              </strong>
              <small>
                {ownerPercentage.toFixed(2)}%
              </small>
            </article>

            <article>
              <span>Mechanic Share</span>
              <strong>
                {formatCurrency(
                  calculation.mechanicAmount,
                )}
              </strong>
              <small>
                {mechanicPercentage.toFixed(2)}%
              </small>
            </article>
          </div>

          <div
            className={
              percentageIsValid
                ? styles.validPercentage
                : styles.invalidPercentage
            }
          >
            Total allocation:{" "}
            {calculation.totalPercentage.toFixed(2)}%
          </div>
        </section>

        <label className={styles.field}>
          <span>Status</span>

          <select
            name="is_active"
            defaultValue={String(
              initialValues?.isActive ?? 1,
            )}
          >
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>

          <small>
            Only active services can be selected in job orders and
            sales.
          </small>
        </label>
      </div>

      <footer className={styles.formFooter}>
        <a href="/services">Cancel</a>

        <button type="submit">
          <Save size={19} />
          {submitLabel}
        </button>
      </footer>
    </form>
  );
}