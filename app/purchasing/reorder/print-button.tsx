"use client";

import { Printer } from "lucide-react";
import styles from "./reorder.module.css";

export default function PrintButton() {
  return <button type="button" className={styles.printButton} onClick={() => window.print()}><Printer size={16}/>Print Reorder List</button>;
}
