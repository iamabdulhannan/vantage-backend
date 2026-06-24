import { Module, Body, Controller, Get, Patch, UseGuards, Injectable, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

// Drop blank strings so a cleared optional field doesn't overwrite stored data with "".
const EmptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class UpdateCompanyDto {
  @IsOptional() @EmptyToUndefined() @IsString() @MinLength(2) name?: string;
  @IsOptional() @EmptyToUndefined() @IsString() industry?: string;
  @IsOptional() @EmptyToUndefined() @IsString() country?: string;
  @IsOptional() @EmptyToUndefined() @IsString() currencyCode?: string;
  @IsOptional() @EmptyToUndefined() @IsString() currencySymbol?: string;
  @IsOptional() @EmptyToUndefined() @IsString() teamSize?: string;
  @IsOptional() @IsNumber() @Min(0) capital?: number;
  @IsOptional() @IsNumber() @Min(0) revenue?: number;
}

function publicCompany(c: any) {
  return {
    id: c.id,
    name: c.name,
    industry: c.industry,
    country: c.country,
    currencyCode: c.currencyCode,
    currencySymbol: c.currencySymbol,
    capital: Number(c.capital ?? 0),
    revenue: Number(c.revenue ?? 0),
    teamSize: c.teamSize,
    seats: c.seats,
    plan: c.plan,
    billingCycle: c.billingCycle,
    billingSince: c.billingSince,
  };
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async me(companyId: string) {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw new NotFoundException('Company not found');
    return publicCompany(c);
  }

  async update(companyId: string, dto: UpdateCompanyDto) {
    const data: Record<string, unknown> = {};
    for (const k of ['name', 'industry', 'country', 'currencyCode', 'currencySymbol', 'teamSize'] as const) {
      const v = dto[k];
      if (v !== undefined) data[k] = v.trim();
    }
    if (dto.capital !== undefined) data.capital = dto.capital;
    if (dto.revenue !== undefined) data.revenue = dto.revenue;
    const c = await this.prisma.company.update({ where: { id: companyId }, data });
    return publicCompany(c);
  }
}

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get('me')
  me(@CurrentUser() u: Principal) {
    return this.companies.me(u.companyId);
  }

  @Patch('me')
  update(@CurrentUser() u: Principal, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(u.companyId, dto);
  }
}

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
