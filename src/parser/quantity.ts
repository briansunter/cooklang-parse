/** Parse a quantity string into a number (including fractions) or keep as string. */
export function parseQuantity(raw: string): string | number {
  const qty = raw.trim()
  if (!qty) return ""
  if (/[a-zA-Z]/.test(qty)) return qty

  // Mixed fraction: "1 1/2", "2 3/4"
  const mixed = qty.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/)
  if (mixed) {
    const whole = mixed[1] ?? ""
    const mNum = mixed[2] ?? ""
    const mDen = mixed[3] ?? ""
    if (whole.startsWith("0") && whole.length > 1) return qty
    if (mNum.startsWith("0") && mNum.length > 1) return qty
    if (+mDen !== 0) return +whole + +mNum / +mDen
  }

  // Simple fraction: "1/2", "3/4"
  const frac = qty.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac?.[1] && frac[2]) {
    if (frac[1].startsWith("0") && frac[1].length > 1) return qty
    if (+frac[2] !== 0) return +frac[1] / +frac[2]
  }

  const num = Number(qty)
  return Number.isNaN(num) ? qty : num
}
