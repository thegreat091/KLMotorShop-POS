"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteBackupAction } from "./actions";
import styles from "./backup-restore.module.css";

export default function DeleteBackupButton({
  filename,
}: {
  filename: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`${styles.iconButton} ${styles.deleteIcon}`}
        title="Delete backup"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={16} />
      </button>

      {open ? (
        <div className={styles.modalBackdrop} onMouseDown={() => setOpen(false)}>
          <div
            className={styles.modal}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>

            <div className={styles.modalDangerIcon}>
              <Trash2 size={24} />
            </div>

            <h3>Delete Backup?</h3>
            <p>{filename}</p>
            <small>This action cannot be undone.</small>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>

              <form action={deleteBackupAction}>
                <input type="hidden" name="filename" value={filename} />
                <button type="submit" className={styles.confirmDeleteButton}>
                  Delete Backup
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
