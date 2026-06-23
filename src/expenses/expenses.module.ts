import { Module } from '@nestjs/common';
import { Body, Controller, Get, Post, UseGuards, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

const EXPENSE_COLORS = ['#4F46E5', '#6366F1', '#818CF8', '#06B6D4', '#22D3EE', '#A5B4FC', '#67E8F9'];

export class CreateExpenseDto {
  @IsString() @MinLength(2) label!: string;
  @IsNumber() @IsPositive() value!: number;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.expense.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
    const expenses = rows.map((e) => ({ id: e.id, label: e.label, value: Number(e.amount), color: e.color, date: e.date }));
    const total = expenses.reduce((s, e) => s + e.value, 0);
    return { expenses, total };
  }

  async create(companyId: string, dto: CreateExpenseDto) {
    const count = await this.prisma.expense.count({ where: { companyId } });
    const color = EXPENSE_COLORS[count % EXPENSE_COLORS.length];
    const expense = await this.prisma.expense.create({
      data: { companyId, label: dto.label.trim(), amount: dto.value, color },
    });
    await this.prisma.activity.create({
      data: { companyId, who: dto.label.trim(), what: 'Expense recorded', amount: dto.value, type: 'invoice' },
    });
    return { id: expense.id, label: expense.label, value: Number(expense.amount), color: expense.color, date: expense.date };
  }
}

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.expenses.list(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: Principal, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(u.companyId, dto);
  }
}

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
