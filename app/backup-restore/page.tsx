import {
  ArrowLeft,
  Database,
  Download,
  FolderArchive,
  HardDriveDownload,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  createBackupAction,
} from "./actions";
import {
  getBackupDirectory,
  listBackups,
} from "./backup-utils";
import RestoreForm from "./restore-form";
import DeleteBackupButton from "./delete-backup-button";
import styles from "./backup-restore.module.css";

type Params = {
  success?: string;
  error?: string;
};

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function BackupRestorePage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  if (!["ADMIN", "OWNER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const backups = await listBackups();
  const params = await searchParams;
  const backupDir = getBackupDirectory();
  const latest = backups[0] ?? null;
  const totalSize = backups.reduce((sum, item) => sum + item.size, 0);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/dashboard" className={styles.back}>
          <ArrowLeft size={17} />
          Dashboard
        </Link>

        <form action={createBackupAction}>
          <button type="submit" className={styles.primaryButton}>
            <HardDriveDownload size={17} />
            Create Backup
          </button>
        </form>
      </div>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Administration</div>
          <h1>Backup & Restore</h1>
          <p>
            Protect the KL Motor Shop database and restore trusted SQL backups.
          </p>
        </div>
        <Database size={46} />
      </section>

      {params.success ? (
        <div className={styles.success}>{params.success}</div>
      ) : null}

      {params.error ? (
        <div className={styles.error}>{params.error}</div>
      ) : null}

      <section className={styles.metrics}>
        <article>
          <RefreshCcw />
          <span>Last Backup</span>
          <strong>{latest ? dateTime(latest.createdAt) : "None yet"}</strong>
        </article>

        <article>
          <FolderArchive />
          <span>Backup Files</span>
          <strong>{backups.length}</strong>
        </article>

        <article>
          <HardDriveDownload />
          <span>Total Backup Size</span>
          <strong>{sizeLabel(totalSize)}</strong>
        </article>

        <article className={styles.pathCard}>
          <Database />
          <span>Backup Folder</span>
          <strong>{backupDir}</strong>
        </article>
      </section>

      <div className={styles.twoColumns}>
        <section className={styles.panel}>
          <header>
            <div>
              <div className={styles.eyebrow}>History</div>
              <h2>Database Backups</h2>
              <p>Backups stored outside the application project folder.</p>
            </div>
          </header>

          {backups.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Filename</th>
                    <th>Size</th>
                    <th>Created By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {backups.map((backup) => (
                    <tr key={backup.filename}>
                      <td>{dateTime(backup.createdAt)}</td>
                      <td>
                        <strong>{backup.filename}</strong>
                      </td>
                      <td>{sizeLabel(backup.size)}</td>
                      <td>
                        {backup.createdBy}
                        <small>{backup.createdByRole}</small>
                      </td>
                      <td className={styles.actions}>
                        <a
                          href={`/backup-restore/download/${encodeURIComponent(
                            backup.filename,
                          )}`}
                          className={styles.iconButton}
                          title="Download backup"
                        >
                          <Download size={16} />
                        </a>

                        <DeleteBackupButton filename={backup.filename} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              No database backups have been created yet.
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <header>
            <div>
              <div className={styles.eyebrow}>Recovery</div>
              <h2>Restore Database</h2>
              <p>Owner/Admin only. Use this only when recovery is necessary.</p>
            </div>
            <ShieldAlert className={styles.restoreIcon} />
          </header>

          <RestoreForm />
        </section>
      </div>

      <section className={styles.infoPanel}>
        <h2>MariaDB / MySQL Tool Location</h2>
        <p>
          Backup uses <code>mariadb-dump</code> or <code>mysqldump</code>.
          Restore uses <code>mariadb</code> or <code>mysql</code>.
          If those commands are not available in Windows PATH, add this to
          <code>.env.local</code> and restart Next.js:
        </p>
        <pre>MYSQL_BIN_DIR=C:\Program Files\MariaDB 12.3\bin</pre>
        <p>
          Optional: override the backup folder with
          <code>KLMOTOR_BACKUP_DIR</code>. The default on Windows is
          <code>C:\KLMotorShop\Backups</code>.
        </p>
      </section>
    </main>
  );
}
