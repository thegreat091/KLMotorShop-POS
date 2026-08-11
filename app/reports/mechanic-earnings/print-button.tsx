"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()}>
      <Printer size={17} /> Print Report
    </button>
  );
}
