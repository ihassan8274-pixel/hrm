/**
 * One cash/bank split for every place that writes a payslip.
 *
 * Generation, final settlement and recalculation must not each invent their own
 * rounding: two different splits for the same net would make the WPS file disagree
 * with the payslip the employee signed.
 */
export function splitNetPayment(
  net: number,
  method: unknown,
  cashPercentage: unknown = 0,
): { cashAmount: number; bankAmount: number } {
  const total = Number.isFinite(Number(net)) ? Number(net) : 0;
  const mode = String(method || "bank");
  if (mode === "cash") {
    return { cashAmount: total, bankAmount: 0 };
  }
  if (mode === "split") {
    const pct = Number.isFinite(Number(cashPercentage)) ? Number(cashPercentage) : 0;
    const cash = Math.round(total * (pct / 100) * 100) / 100;
    return { cashAmount: cash, bankAmount: Math.round((total - cash) * 100) / 100 };
  }
  return { cashAmount: 0, bankAmount: total };
}
