/**
 * Salary withholding tax engine - progressive government slabs, not a flat rate.
 *
 * Pakistan: FBR salaried-individual slabs, FY 2025-26 (effective 1 July 2025),
 * applied to ANNUAL taxable income; the monthly withholding is 1/12 of the
 * annual liability (how employers actually deduct under Section 149).
 *
 * Other countries default to 0% until their tables are added - showing no tax
 * is more honest than inventing a rate.
 */

interface Slab {
  upTo: number; // annual income ceiling for this slab
  base: number; // tax on all income below `over`
  rate: number; // marginal rate on income above `over`
  over: number;
}

// FBR FY 2025-26 salaried slabs (annual PKR).
const PK_SLABS: Slab[] = [
  { upTo: 600_000, base: 0, rate: 0, over: 0 },
  { upTo: 1_200_000, base: 0, rate: 0.01, over: 600_000 },
  { upTo: 2_200_000, base: 6_000, rate: 0.11, over: 1_200_000 },
  { upTo: 3_200_000, base: 116_000, rate: 0.23, over: 2_200_000 },
  { upTo: 4_100_000, base: 346_000, rate: 0.3, over: 3_200_000 },
  { upTo: Infinity, base: 616_000, rate: 0.35, over: 4_100_000 },
];

// 9% surcharge on the tax amount where annual taxable income exceeds 10M.
const PK_SURCHARGE_THRESHOLD = 10_000_000;
const PK_SURCHARGE_RATE = 0.09;

export function pkAnnualTax(annualIncome: number): number {
  const slab = PK_SLABS.find((s) => annualIncome <= s.upTo)!;
  let tax = slab.base + slab.rate * Math.max(0, annualIncome - slab.over);
  if (annualIncome > PK_SURCHARGE_THRESHOLD) tax *= 1 + PK_SURCHARGE_RATE;
  return Math.round(tax);
}

export interface TaxRule {
  /** Shown in the UI, e.g. "FBR 2025-26 slabs". */
  name: string;
  /** Monthly withholding for a given MONTHLY salary. */
  monthlyTax(monthlySalary: number): number;
}

const PK_RULE: TaxRule = {
  name: 'FBR 2025-26 slabs',
  monthlyTax: (monthly) => Math.round(pkAnnualTax(monthly * 12) / 12),
};

const NO_TAX = (name: string): TaxRule => ({ name, monthlyTax: () => 0 });

/** Resolve the withholding rule from the company's country / base currency. */
export function taxRuleFor(country?: string | null, currencyCode?: string | null): TaxRule {
  const c = (country ?? '').toLowerCase();
  if (c.includes('pakistan') || currencyCode === 'PKR') return PK_RULE;
  if (c.includes('emirates') || c.includes('uae') || c.includes('dubai') || currencyCode === 'AED')
    return NO_TAX('No salary income tax (UAE)');
  if (c.includes('saudi') || currencyCode === 'SAR') return NO_TAX('No salary income tax (KSA)');
  return NO_TAX('No tax table configured');
}
