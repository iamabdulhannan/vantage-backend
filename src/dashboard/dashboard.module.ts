import { Module, Controller, Get, UseGuards, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';
import { TAX_RATE } from '../employees/employees.module';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(companyId: string) {
    const [expenses, entries, partners, employees, activity, customerCount] = await Promise.all([
      this.prisma.expense.findMany({ where: { companyId } }),
      this.prisma.ledgerEntry.findMany({ where: { customer: { companyId } } }),
      this.prisma.partner.findMany({ where: { companyId } }),
      this.prisma.employee.findMany({ where: { companyId } }),
      this.prisma.activity.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.customer.count({ where: { companyId } }),
    ]);

    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const receipts = entries.filter((e) => e.kind === 'got').reduce((s, e) => s + Number(e.amount), 0);
    const partnerRevenue = partners.reduce((s, p) => s + Number(p.revenue), 0);
    const revenue = receipts + partnerRevenue;
    const profit = revenue - totalExpenses;

    const gross = employees.reduce((s, e) => s + Number(e.salary), 0);
    const tax = Math.round(gross * TAX_RATE);
    const pendingPayroll = employees.filter((e) => e.status === 'pending').reduce((s, e) => s + Number(e.salary), 0);

    const monthlyBurn = Math.round(totalExpenses / 12);
    const cashPosition = receipts - totalExpenses;
    const runwayMonths = monthlyBurn > 0 && cashPosition > 0 ? +(cashPosition / monthlyBurn).toFixed(1) : null;

    const expenseBreakdown = expenses.map((e) => ({
      label: e.label,
      value: Number(e.amount),
      color: e.color,
      pct: totalExpenses ? Math.round((Number(e.amount) / totalExpenses) * 100) : 0,
    }));

    return {
      kpis: { revenue, expenses: totalExpenses, profit, partnerRevenue },
      cash: { monthlyBurn, cashPosition, runwayMonths },
      payroll: { gross, tax, net: gross - tax, pendingAmount: pendingPayroll, headcount: employees.length },
      counts: { customers: customerCount, partners: partners.length, employees: employees.length },
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
