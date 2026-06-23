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

export const TAX_RATE = 0.12;

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

export class CreateEmployeeDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() dept?: string;
  @IsNumber() @IsPositive() salary!: number;
}

export class IncrementDto {
  @IsNumber() @IsPositive() amount!: number;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private summary(rows: { salary: any; status: string }[]) {
    const list = rows.map((e) => ({ salary: Number(e.salary), status: e.status }));
    const gross = list.reduce((s, e) => s + e.salary, 0);
    const tax = Math.round(gross * TAX_RATE);
    const net = gross - tax;
    const paid = list.filter((e) => e.status === 'paid');
    const pending = list.filter((e) => e.status === 'pending');
    const paidAmount = paid.reduce((s, e) => s + e.salary, 0);
    const pendingAmount = pending.reduce((s, e) => s + e.salary, 0);
    return {
      gross,
      tax,
      net,
      taxRate: TAX_RATE,
      headcount: list.length,
      paidCount: paid.length,
      pendingCount: pending.length,
      paidAmount,
      pendingAmount,
      paidRatio: gross ? paidAmount / gross : 0,
    };
  }

  async list(companyId: string) {
    const rows = await this.prisma.employee.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
    const employees = rows.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      dept: e.dept,
      initials: e.initials,
      salary: Number(e.salary),
      status: e.status,
    }));
    return { employees, payroll: this.summary(rows) };
  }

  async create(companyId: string, dto: CreateEmployeeDto) {
    const e = await this.prisma.employee.create({
      data: {
        companyId,
        name: dto.name.trim(),
        role: dto.role?.trim() || 'Team member',
        dept: dto.dept?.trim() || 'General',
        initials: initialsFrom(dto.name),
        salary: dto.salary,
        status: 'pending',
      },
    });
    return { ...e, salary: Number(e.salary) };
  }

  private async ensure(companyId: string, id: string) {
    const e = await this.prisma.employee.findFirst({ where: { id, companyId } });
    if (!e) throw new NotFoundException('Employee not found');
    return e;
  }

  async increment(companyId: string, id: string, dto: IncrementDto) {
    const e = await this.ensure(companyId, id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { salary: Number(e.salary) + dto.amount, status: 'pending' },
    });
    return { ...updated, salary: Number(updated.salary) };
  }

  async remove(companyId: string, id: string) {
    await this.ensure(companyId, id);
    await this.prisma.employee.delete({ where: { id } });
    return { id, removed: true };
  }

  async runPayroll(companyId: string) {
    const pending = await this.prisma.employee.findMany({ where: { companyId, status: 'pending' } });
    const disbursed = pending.reduce((s, e) => s + Number(e.salary), 0);
    if (pending.length) {
      await this.prisma.$transaction([
        this.prisma.employee.updateMany({ where: { companyId, status: 'pending' }, data: { status: 'paid' } }),
        this.prisma.activity.create({
          data: { companyId, who: 'Payroll', what: 'Salaries disbursed', amount: disbursed, type: 'payment' },
        }),
      ]);
    }
    return { disbursed, count: pending.length };
  }
}

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.employees.list(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: Principal, @Body() dto: CreateEmployeeDto) {
    return this.employees.create(u.companyId, dto);
  }

  @Post('payroll/run')
  runPayroll(@CurrentUser() u: Principal) {
    return this.employees.runPayroll(u.companyId);
  }

  @Patch(':id/increment')
  increment(@CurrentUser() u: Principal, @Param('id') id: string, @Body() dto: IncrementDto) {
    return this.employees.increment(u.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.employees.remove(u.companyId, id);
  }
}

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
