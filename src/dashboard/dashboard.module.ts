import { Module, Controller, Get, UseGuards, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';
import { taxRuleFor } from '../common/salary-tax';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(companyId: string) {
    const [company, expenses, entries, partners, employees, activity, customerCount] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.expense.findMany({ where: { companyId } }),
      this.prisma.ledgerEntry.findMany({ where: { customer: { companyId } } }),
      this.prisma.partner.findMany({ where: { companyId } }),
      this.prisma.employee.findMany({ where: { companyId } }),
      this.prisma.activity.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.customer.count({ where: { companyId } }),
    ]);

    const openingRevenue = Number(company?.revenue ?? 0);
    const openingCapital = Number(company?.capital ?? 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const receipts = entries.filter((e) => e.kind === 'got').reduce((s, e) => s + Number(e.amount), 0);
    const partnerRevenue = partners.reduce((s, p) => s + Number(p.revenue), 0);
    // Total revenue = the figure set at setup + payments collected through the khata book.
    const revenue = openingRevenue + receipts;

    const gross = employees.reduce((s, e) => s + Number(e.salary), 0);
    const taxRule = taxRuleFor(company?.country, company?.currencyCode);
    const tax = employees.reduce((s, e) => s + taxRule.monthlyTax(Number(e.salary)), 0);
    const pendingPayroll = employees.filter((e) => e.status === 'pending').reduce((s, e) => s + Number(e.salary), 0);
    const paidPayroll = employees.filter((e) => e.status === 'paid').reduce((s, e) => s + Number(e.salary), 0);

    // Working capital is a *live cash position*, not a frozen figure: it starts at the capital
    // entered at setup, grows with payments collected, and shrinks with expenses + salaries paid.
    const capital = openingCapital + receipts - totalExpenses - paidPayroll;
    const profit = revenue - totalExpenses - paidPayroll;

    // Forward monthly cash burn ≈ recurring salaries + averaged operating expenses.
    const monthlyBurn = Math.round(gross + totalExpenses / 12);
    const runwayMonths = monthlyBurn > 0 && capital > 0 ? +(capital / monthlyBurn).toFixed(1) : null;

    // ---- Real monthly series (last 12 months) from dated records ----------
    const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const buckets: { key: string; label: string; revenue: number; expense: number }[] = [];
    const indexByKey = new Map<string, number>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      indexByKey.set(key, buckets.length);
      buckets.push({ key, label: MONTH_LABELS[d.getMonth()], revenue: 0, expense: 0 });
    }
    const bucketFor = (date: Date) => {
      const d = new Date(date);
      return indexByKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    };
    for (const e of entries) {
      if (e.kind !== 'got') continue;
      const idx = bucketFor(e.date);
      if (idx !== undefined) buckets[idx].revenue += Number(e.amount);
    }
    for (const e of expenses) {
      const idx = bucketFor(e.date);
      if (idx !== undefined) buckets[idx].expense += Number(e.amount);
    }
    const series = buckets.map((b) => ({ label: b.label, revenue: b.revenue, expense: b.expense }));
    const revSpark = buckets.map((b) => b.revenue);
    const expSpark = buckets.map((b) => b.expense);
    const profitSpark = buckets.map((b) => b.revenue - b.expense);

    // Month-over-month % change (current vs previous month); null when no prior baseline.
    const pctChange = (cur: number, prev: number): number | null =>
      prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : null;
    const last = buckets[11];
    const prev = buckets[10];
    const monthsWithActivity = buckets.filter((b) => b.revenue > 0 || b.expense > 0).length;
    const hasHistory = monthsWithActivity >= 2;

    const trends = {
      revenue: { delta: pctChange(last.revenue, prev.revenue), spark: revSpark },
      expenses: { delta: pctChange(last.expense, prev.expense), spark: expSpark },
      profit: { delta: pctChange(last.revenue - last.expense, prev.revenue - prev.expense), spark: profitSpark },
      // Capital is a stored balance, not a dated flow - no real month-over-month trend.
      capital: { delta: null as number | null, spark: [] as number[] },
    };

    // Group expenses by category for the donut.
    const grouped = new Map<string, { label: string; value: number; color: string }>();
    for (const e of expenses) {
      const cur = grouped.get(e.label);
      if (cur) cur.value += Number(e.amount);
      else grouped.set(e.label, { label: e.label, value: Number(e.amount), color: e.color });
    }
    const expenseBreakdown = [...grouped.values()].map((g) => ({
      ...g,
      pct: totalExpenses ? Math.round((g.value / totalExpenses) * 100) : 0,
    }));

    return {
      kpis: { revenue, capital, expenses: totalExpenses, profit, partnerRevenue },
      cash: { monthlyBurn, capital, runwayMonths },
      payroll: { gross, tax, net: gross - tax, pendingAmount: pendingPayroll, headcount: employees.length },
      counts: { customers: customerCount, partners: partners.length, employees: employees.length },
      series,
      trends,
      hasHistory,
      expenseBreakdown,
      activity: activity.map((a) => ({
        id: a.id,
        who: a.who,
        what: a.what,
        amount: Number(a.amount),
        type: a.type,
        when: a.createdAt,
      })),
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('me')
  overview(@CurrentUser() u: Principal) {
    return this.dashboard.overview(u.companyId);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
