"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  Database,
  FileText,
  RotateCcw,
  UploadCloud,
} from "lucide-react";
import styles from "./backup-restore.module.css";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function RestoreForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  const validFile =
    file !== null &&
    file.name.toLowerCase().endsWith(".sql") &&
    file.size > 0 &&
    file.size <= 250 * 1024 * 1024;

  const canRestore = validFile && confirmation === "RESTORE" && !busy;

  function chooseFile() {
    inputRef.current?.click();
  }

  function acceptFile(nextFile: File | null) {
    setMessage("");

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!nextFile.name.toLowerCase().endsWith(".sql")) {
      setFile(null);
      setMessage("Only .sql database backup files are accepted.");
      return;
    }

    if (nextFile.size <= 0 || nextFile.size > 250 * 1024 * 1024) {
      setFile(null);
      setMessage("Backup file must be between 1 byte and 250 MB.");
      return;
    }

    setFile(nextFile);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canRestore || !file) {
      setMessage(
        'Select a valid .sql file and type "RESTORE" exactly before continuing.',
      );
      return;
    }

    setBusy(true);
    setMessage("");

    const data = new FormData();
    data.set("backup_file", file);
    data.set("confirmation", confirmation);

    try {
      const response = await fetch("/backup-restore/restore", {
        method: "POST",
        body: data,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.message || "Restore failed.");
      }

      setMessage(
        "Database restored successfully. Refresh or sign in again before continuing.",
      );
      setFile(null);
      setConfirmation("");

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to restore database.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.restoreForm}>
      <div className={styles.warningBox}>
        <RotateCcw size={21} />
        <div>
          <strong>WARNING — Restore replaces the current database.</strong>
          <span>
            Create a fresh backup first if you need to preserve the current
            data. Restore only trusted KL Motor Shop SQL backup files.
          </span>
        </div>
      </div>

      <div>
        <div className={styles.fieldLabel}>SQL Backup File</div>

        <button
          type="button"
          className={`${styles.dropZone} ${
            dragging ? styles.dropZoneActive : ""
          } ${validFile ? styles.dropZoneReady : ""}`}
          onClick={chooseFile}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".sql,text/plain,application/sql"
            className={styles.hiddenFileInput}
            onChange={(event) =>
              acceptFile(event.target.files?.[0] ?? null)
            }
          />

          <span className={styles.dropIcon}>
            {validFile ? (
              <CheckCircle2 size={27} />
            ) : (
              <UploadCloud size={27} />
            )}
          </span>

          <strong>
            {validFile
              ? "Backup file ready"
              : "Click to select or drag & drop SQL backup"}
          </strong>

          <span>
            {validFile
              ? "The selected file passed basic validation."
              : "Accepted file type: .sql • Maximum size: 250 MB"}
          </span>
        </button>
      </div>

      {file ? (
        <div className={styles.selectedFileCard}>
          <div className={styles.selectedFileIcon}>
            <FileText size={22} />
          </div>

          <div className={styles.selectedFileBody}>
            <span>Selected Backup</span>
            <strong>{file.name}</strong>
            <small>{formatSize(file.size)} • SQL Database Backup</small>
          </div>

          <span className={styles.readyBadge}>READY</span>
        </div>
      ) : null}

      <label>
        Type RESTORE to confirm
        <input
          name="confirmation"
          autoComplete="off"
          placeholder="RESTORE"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          required
        />
      </label>

      <div className={styles.restoreChecklist}>
        <div className={validFile ? styles.checkReady : styles.checkPending}>
          {validFile ? <CheckCircle2 size={16} /> : <Database size={16} />}
          Valid SQL backup selected
        </div>

        <div
          className={
            confirmation === "RESTORE"
              ? styles.checkReady
              : styles.checkPending
          }
        >
          {confirmation === "RESTORE" ? (
            <CheckCircle2 size={16} />
          ) : (
            <Database size={16} />
          )}
          RESTORE confirmation entered
        </div>
      </div>

      {message ? <div className={styles.restoreMessage}>{message}</div> : null}

      <button
        type="submit"
        className={styles.dangerButton}
        disabled={!canRestore}
      >
        <RotateCcw size={17} />
        {busy ? "Restoring..." : "Restore Database"}
      </button>
    </form>
  );
}
