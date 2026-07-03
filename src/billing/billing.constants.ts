import { Plan, BillingCycle } from '@prisma/client';

export interface PlanDef {
  key: Plan;
  name: string;
  blurb: string;
  pricePerSeat: number; // USD per seat per month
  minSeats: number;
  features: string[];
}

// No free tier - the cheapest seat is $10/mo.
export const PLANS: PlanDef[] = [
  {
    key: 'starter',
    name: 'Starter',
    blurb: 'Essentials to run your books',
    pricePerSeat: 10,
    minSeats: 1,
    features: ['Customer khata ledgers', 'Expense tracking', 'Dashboard & live revenue'],
  },
  {
    key: 'growth',
    name: 'Growth',
    blurb: 'Scale with partners & payroll',
    pricePerSeat: 24,
    minSeats: 3,
    features: ['Everything in Starter', 'Partner revenue split', 'Live payroll', 'Unlimited admins'],
  },
  {
    key: 'scale',
    name: 'Scale',
    blurb: 'Full control & insights',
    pricePerSeat: 49,
    minSeats: 10,
    features: ['Everything in Growth', 'Advanced reports & export', 'Priority support', 'Audit log'],
  },
];

export const ANNUAL_DISCOUNT = 0.2; // 20% off when billed yearly
export const BILLING_MIN = 10; // USD floor - never bill less than this

export interface BillingBreakdown {
  planKey: Plan;
  planName: string;
  cycle: BillingCycle;
  seats: number;
  monthlyPerSeat: number;
  annualPerSeat: number;
  monthlyTotal: number;
  annualTotal: number;
  effectiveMonthly: number;
  dueNow: number;
  annualSavings: number;
  nextRenewal: string; // ISO date
}

export function planDef(key: Plan): PlanDef {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

export function computeBilling(
  planKey: Plan,
  seatsInput: number,
  cycle: BillingCycle,
  since: Date = new Date(),
): BillingBreakdown {
  const plan = planDef(planKey);
  const seats = Math.max(seatsInput, plan.minSeats);

  const monthlyPerSeat = plan.pricePerSeat;
  const annualPerSeat = Math.round(monthlyPerSeat * 12 * (1 - ANNUAL_DISCOUNT));

  const monthlyTotal = Math.max(seats * monthlyPerSeat, BILLING_MIN);
  const annualTotal = Math.max(seats * annualPerSeat, BILLING_MIN);

  const dueNow = cycle === 'annual' ? annualTotal : monthlyTotal;
  const effectiveMonthly = cycle === 'annual' ? annualTotal / 12 : monthlyTotal;
  const annualSavings = seats * monthlyPerSeat * 12 - annualTotal;

  const renew = new Date(since);
  renew.setMonth(renew.getMonth() + (cycle === 'annual' ? 12 : 1));

  return {
    planKey: plan.key,
    planName: plan.name,
    cycle,
    seats,
    monthlyPerSeat,
    annualPerSeat,
    monthlyTotal,
    annualTotal,
    effectiveMonthly,
    dueNow,
    annualSavings,
    nextRenewal: renew.toISOString().slice(0, 10),
  };
}
