export function accountForPaymentMethod(method: string) {
  switch (method) {
    case "CASH":
      return "CASH";
    case "GCASH":
      return "GCASH";
    case "BANK_TRANSFER":
      return "BANK";
    case "CARD":
      return "CARD";
    default:
      return "OTHER";
  }
}
