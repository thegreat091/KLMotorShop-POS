import type { RowDataPacket } from "mysql2";
import {
  ArrowLeft,
  Building2,
  CircleDollarSign,
  PackageOpen,
  Printer,
  Save,
  Settings2,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { saveSettingsAction } from "./actions";
import styles from "./settings.module.css";

interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string | null;
}

type Params = {
  success?: string;
  error?: string;
};

function getValue(
  settings: Map<string, string>,
  key: string,
  fallback = "",
) {
  return settings.get(key) ?? fallback;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  if (!["ADMIN", "OWNER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const [rows] = await pool.query<SettingRow[]>(
    `
      SELECT setting_key, setting_value
      FROM system_settings
    `,
  );

  const settings = new Map(
    rows.map((row) => [row.setting_key, row.setting_value ?? ""]),
  );

  const params = await searchParams;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard" className={styles.back}>
          <ArrowLeft size={17} />
          Dashboard
        </Link>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>System Settings</h1>
          <p>
            Manage KL Motor Shop business, workshop, inventory, POS,
            and printer defaults.
          </p>
        </div>
        <Settings2 size={44} />
      </section>

      {params.success ? (
        <div className={styles.success}>{params.success}</div>
      ) : null}

      {params.error ? (
        <div className={styles.error}>{params.error}</div>
      ) : null}

      <form action={saveSettingsAction} className={styles.settingsForm}>
        <section className={styles.card}>
          <header>
            <span className={styles.icon}>
              <Building2 size={20} />
            </span>
            <div>
              <h2>Business Information</h2>
              <p>Information used on receipts and business documents.</p>
            </div>
          </header>

          <div className={styles.grid}>
            <label>
              Shop Name
              <input
                name="shop_name"
                defaultValue={getValue(settings, "shop_name", "KL Motor Shop")}
                required
              />
            </label>

            <label>
              Contact Number
              <input
                name="shop_contact"
                defaultValue={getValue(settings, "shop_contact")}
              />
            </label>

            <label className={styles.full}>
              Business Address
              <input
                name="shop_address"
                defaultValue={getValue(settings, "shop_address")}
              />
            </label>

            <label>
              Email Address
              <input
                type="email"
                name="shop_email"
                defaultValue={getValue(settings, "shop_email")}
              />
            </label>

            <label>
              TIN
              <input
                name="shop_tin"
                defaultValue={getValue(settings, "shop_tin")}
              />
            </label>

            <label className={styles.full}>
              Receipt Footer
              <textarea
                name="receipt_footer"
                rows={3}
                defaultValue={getValue(
                  settings,
                  "receipt_footer",
                  "Thank you for choosing KL Motor Shop.",
                )}
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <header>
            <span className={styles.icon}>
              <Wrench size={20} />
            </span>
            <div>
              <h2>Workshop Settings</h2>
              <p>Default service revenue split used for mechanic earnings.</p>
            </div>
          </header>

          <div className={styles.grid}>
            <label>
              Owner Share (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                name="default_owner_percentage"
                defaultValue={getValue(
                  settings,
                  "default_owner_percentage",
                  "20.00",
                )}
              />
            </label>

            <label>
              Mechanic Share (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                name="default_mechanic_percentage"
                defaultValue={getValue(
                  settings,
                  "default_mechanic_percentage",
                  "80.00",
                )}
              />
            </label>

            <div className={styles.note}>
              Owner + Mechanic must equal 100%.
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <header>
            <span className={styles.icon}>
              <PackageOpen size={20} />
            </span>
            <div>
              <h2>Inventory Settings</h2>
              <p>Default inventory values for newly created records.</p>
            </div>
          </header>

          <div className={styles.grid}>
            <label>
              Default Reorder Level
              <input
                type="number"
                min="0"
                step="0.01"
                name="default_reorder_level"
                defaultValue={getValue(
                  settings,
                  "default_reorder_level",
                  "0.00",
                )}
              />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <header>
            <span className={styles.icon}>
              <CircleDollarSign size={20} />
            </span>
            <div>
              <h2>POS & Receipt</h2>
              <p>Defaults for the current POS and Epson L121 print workflow.</p>
            </div>
          </header>

          <div className={styles.grid}>
            <label>
              Currency
              <select name="currency" defaultValue={getValue(settings, "currency", "PHP")}>
                <option value="PHP">PHP — Philippine Peso</option>
              </select>
            </label>

            <label>
              Receipt Paper Size
              <select
                name="receipt_paper_size"
                defaultValue={getValue(
                  settings,
                  "receipt_paper_size",
                  "LETTER",
                )}
              >
                <option value="LETTER">Short Bond / Letter (8.5 × 11 in)</option>
              </select>
            </label>

            <label>
              Time Zone
              <select
                name="timezone"
                defaultValue={getValue(settings, "timezone", "Asia/Manila")}
              >
                <option value="Asia/Manila">Asia/Manila</option>
              </select>
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <header>
            <span className={styles.icon}>
              <Printer size={20} />
            </span>
            <div>
              <h2>Printer Settings</h2>
              <p>
                Reference names for the receipt and barcode-label printers.
              </p>
            </div>
          </header>

          <div className={styles.grid}>
            <label>
              Receipt Printer Name
              <input
                name="receipt_printer_name"
                placeholder="e.g. EPSON L121 Series"
                defaultValue={getValue(
                  settings,
                  "receipt_printer_name",
                  "EPSON L121 Series",
                )}
              />
            </label>

            <label>
              Barcode Label Printer Name
              <input
                name="label_printer_name"
                placeholder="Optional"
                defaultValue={getValue(settings, "label_printer_name")}
              />
            </label>

            <label className={styles.full}>
              Printer Notes
              <textarea
                name="printer_notes"
                rows={3}
                placeholder="Paper loading or printer setup notes..."
                defaultValue={getValue(settings, "printer_notes")}
              />
            </label>
          </div>
        </section>

        <div className={styles.saveBar}>
          <span>
            Settings are applied as system defaults. Existing historical
            transactions are not changed.
          </span>
          <button type="submit">
            <Save size={17} />
            Save Settings
          </button>
        </div>
      </form>
    </main>
  );
}
