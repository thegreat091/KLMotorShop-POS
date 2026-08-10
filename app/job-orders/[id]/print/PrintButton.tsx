"use client";

import styles from "./print.module.css";

export default function PrintButton() {
  return <button type="button" className={styles.screenButton} onClick={() => window.print()}>Print Job Order</button>;
}
