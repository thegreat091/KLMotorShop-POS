"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import styles from "./stock-inquiry.module.css";

export default function InquiryForm({ initialValue }: { initialValue: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <form className={styles.scanForm} method="get">
      <div className={styles.scanInputWrap}>
        <Search size={22} />
        <input
          ref={inputRef}
          name="q"
          defaultValue={initialValue}
          autoComplete="off"
          placeholder="Scan KL batch barcode, factory barcode, product code, or search product name"
          aria-label="Scan barcode or search product"
        />
      </div>
      <button type="submit">Search</button>
    </form>
  );
}
