"use client";

import { useFormStatus } from "react-dom";
import styles from "./clients.module.css";

export default function ConfirmStatusButton({
  active,
  clientName,
}: {
  active: boolean;
  clientName: string;
}) {
  const { pending } = useFormStatus();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (active) {
      const confirmed = window.confirm(
        `Deactivate ${clientName}?\n\nThe client will remain in previous sales and job orders but cannot be selected for new transactions.`,
      );

      if (!confirmed) {
        event.preventDefault();
      }
    }
  }

  return (
    <button
      type="submit"
      onClick={handleClick}
      disabled={pending}
      className={active ? styles.deactivateButton : styles.activateButton}
    >
      {pending ? "Saving..." : active ? "Deactivate" : "Activate"}
    </button>
  );
}
