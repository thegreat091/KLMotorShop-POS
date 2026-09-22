"use client";
import {QRCodeSVG} from "qrcode.react";
export default function ProductQr({value}:{value:string}){return <QRCodeSVG value={value} size={256} level="M" marginSize={2} bgColor="#fff" fgColor="#000" title={`Product QR ${value}`}/>}
