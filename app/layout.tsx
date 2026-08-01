import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "KL Motor Shop POS & Inventory",
    template: "%s | KL Motor Shop",
  },
  description:
    "Point of Sale and Inventory Management System for KL Motor Shop and Accessories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}