import {
  Module,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

const EXPENSE_COLORS = ['#16A34A', '#0E7490', '#C2760A', '#15803D', '#0891B2', '#65A30D', '#B45309'];

export class CreateExpenseDto {
  @IsString() @MinLength(2) label!: string;
  @IsNumber() @IsPositive() value!: number;
  @IsOptional() @IsString() note?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString() @MinLength(2) label?: string;
  @IsOptional() @IsNumber() @IsPositive() value?: number;
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.expense.findMany({ where: { companyId }, orderBy: { date: 'desc' } });
    const expenses = rows.map((e) => ({
      id: e.id,
      label: e.label,
      value: Number(e.amount),
      note: e.note ?? undefined,
      color: e.color,
      date: e.date,
    }));
    const total = expenses.reduce((s, e) => s + e.value, 0);
    // Grouped-by-category breakdown for charts.
    const byCategory = new Map<string, { label: string; value: number; color: string }>();
    for (const e of expenses) {
      const cur = byCategory.get(e.label);
      if (cur) cur.value += e.value;
      else byCategory.set(e.label, { label: e.label, value: e.value, color: e.color });
    }
    return { expenses, total, breakdown: [...byCategory.values()] };
  }

  async create(companyId: string, dto: CreateExpenseDto) {
    const count = await this.prisma.expense.count({ where: { companyId } });
    const color = EXPENSE_COLORS[count % EXPENSE_COLORS.length];
    const expense = await this.prisma.expense.create({
      data: { companyId, label: dto.label.trim(), amount: dto.value, note: dto.note?.trim() || null, color },
    });
    await this.prisma.activity.create({
      data: { companyId, who: dto.label.trim(), what: 'Expense recorded', amount: dto.value, type: 'invoice' },
    });
    return {
      id: expense.id,
      label: expense.label,
      value: Number(expense.amount),
      note: expense.note ?? undefined,
      color: expense.color,
      date: expense.date,
    };
  }

  async update(companyId: string, id: string, dto: UpdateExpenseDto) {
    const existing = await this.prisma.expense.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Expense not found');
    const e = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.value !== undefined ? { amount: dto.value } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
    });
    return { id: e.id, label: e.label, value: Number(e.amount), note: e.note ?? undefined, color: e.color, date: e.date };
  }

  async remove(companyId: string, id: string) {
    const e = await this.prisma.expense.findFirst({ where: { id, companyId } });
    if (!e) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id } });
    return { id, removed: true };
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

  @Patch(':id')
  update(@CurrentUser() u: Principal, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(u.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.expenses.remove(u.companyId, id);
  }
}

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
