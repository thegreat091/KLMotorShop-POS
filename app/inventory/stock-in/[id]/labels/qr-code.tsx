"use client";

import { QRCodeSVG } from "qrcode.react";

export default function StockInQrCode({ value }: { value: string }) {
  return (
    <QRCodeSVG
      value={value}
      size={256}
      level="M"
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#000000"
      title={`QR code ${value}`}
    />
  );
}
