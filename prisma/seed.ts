import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2)).toUpperCase();
}

async function main() {
  const ownerEmail = 'alex@northwind.io';
  const existing = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existing) {
    console.log('Seed skipped — demo company already exists.');
    return;
  }

  const passwordHash = await bcrypt.hash('vantage', 10);

  const company = await prisma.company.create({
    data: {
      name: 'Northwind Holdings',
      industry: 'Wholesale / Distribution',
      country: 'Pakistan',
      currencyCode: 'PKR',
      currencySymbol: 'Rs',
      teamSize: '11–50',
      seats: 5,
      plan: 'growth',
      billingCycle: 'annual',
      users: {
        create: { name: 'Alex Mercer', role: 'Founder & CEO', email: ownerEmail, passwordHash },
      },
      expenses: {
        create: [
          { label: 'Payroll', amount: 1_320_000, color: '#4F46E5' },
          { label: 'Operations', amount: 642_000, color: '#6366F1' },
          { label: 'Marketing', amount: 458_000, color: '#818CF8' },
          { label: 'R&D', amount: 326_300, color: '#06B6D4' },
          { label: 'Facilities', amount: 210_000, color: '#22D3EE' },
        ],
      },
      partners: {
        create: [
          { name: 'Meridian Capital', region: 'North America', share: 32, revenue: 1_542_000, delta: 9.1, status: 'active' },
          { name: 'Aurora Ventures', region: 'EMEA', share: 24, revenue: 1_156_900, delta: 14.7, status: 'active' },
          { name: 'Pacific Synergy', region: 'APAC', share: 18, revenue: 867_700, delta: -2.3, status: 'review' },
        ],
      },
      employees: {
        create: [
          { name: 'Maya Thomas', role: 'VP Engineering', dept: 'Engineering', initials: 'MT', salary: 18_500, status: 'paid' },
          { name: 'Daniel Cruz', role: 'Head of Sales', dept: 'Sales', initials: 'DC', salary: 16_200, status: 'paid' },
          { name: 'Tomás Silva', role: 'Senior Designer', dept: 'Product', initials: 'TS', salary: 11_400, status: 'pending' },
          { name: 'Grace Liu', role: 'Backend Engineer', dept: 'Engineering', initials: 'GL', salary: 12_600, status: 'pending' },
        ],
      },
    },
  });

  // Customers with ledger entries (kind: gave = owed to us, got = paid)
  const customers = [
    {
      name: 'Elena Russo',
      business: 'Vertex Logistics',
      entries: [
        { memo: 'Invoice #1042 — Q2 services', kind: 'gave' as const, amount: 24_000 },
        { memo: 'Payment received — ACH', kind: 'got' as const, amount: 12_000 },
        { memo: 'Invoice #1088 — freight', kind: 'gave' as const, amount: 9_450 },
        { memo: 'Credit note — adjustment', kind: 'got' as const, amount: 3_000 },
      ],
    },
    {
      name: 'David Okafor',
      business: 'Nimbus Cloud',
      entries: [
        { memo: 'Invoice #0934 — annual license', kind: 'gave' as const, amount: 60_000 },
        { memo: 'Payment received — wire', kind: 'got' as const, amount: 17_200 },
      ],
    },
    {
      name: 'Marcus Chen',
      business: 'Brightline Media',
      entries: [
        { memo: 'Invoice #0991 — campaign', kind: 'gave' as const, amount: 31_000 },
        { memo: 'Payment received — wire', kind: 'got' as const, amount: 31_000 },
      ],
    },
  ];

  for (const c of customers) {
    await prisma.customer.create({
      data: {
        companyId: company.id,
        name: c.name,
        business: c.business,
        initials: initials(c.name),
        entries: { create: c.entries.map((e) => ({ memo: e.memo, kind: e.kind, amount: e.amount })) },
      },
    });
  }

  console.log(`Seed complete. Login: ${ownerEmail} / vantage`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
