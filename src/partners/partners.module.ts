import { Module, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Injectable, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PartnerStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

// Blank optional form fields arrive as '' - treat them as "not provided".
const EmptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class CreatePartnerDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @EmptyToUndefined() @IsString() region?: string;
  @IsOptional() @EmptyToUndefined() @IsString() contact?: string;
  @IsOptional() @EmptyToUndefined() @IsString() phone?: string;
  @IsOptional() @EmptyToUndefined() @IsEmail() email?: string;
  @IsInt() @Min(0) @Max(100) share!: number;
  @IsOptional() @IsNumber() revenue?: number;
  @IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
}

export class UpdatePartnerDto {
  @IsOptional() @EmptyToUndefined() @IsString() @MinLength(2) name?: string;
  @IsOptional() @EmptyToUndefined() @IsString() region?: string;
  @IsOptional() @EmptyToUndefined() @IsString() contact?: string;
  @IsOptional() @EmptyToUndefined() @IsString() phone?: string;
  @IsOptional() @EmptyToUndefined() @IsEmail() email?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) share?: number;
  @IsOptional() @IsNumber() revenue?: number;
  @IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
}

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.partner.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
    const partners = rows.map((p) => ({
      id: p.id,
      name: p.name,
      region: p.region,
      contact: p.contact,
      phone: p.phone,
      email: p.email,
      share: p.share,
      revenue: Number(p.revenue),
      delta: p.delta,
      status: p.status,
    }));
    const totalRevenue = partners.reduce((s, p) => s + p.revenue, 0);
    const totalShare = partners.reduce((s, p) => s + p.share, 0);
    const activeCount = partners.filter((p) => p.status === 'active').length;
    return { partners, totalRevenue, totalShare, activeCount };
  }

  async create(companyId: string, dto: CreatePartnerDto) {
    const partner = await this.prisma.partner.create({
      data: {
        companyId,
        name: dto.name.trim(),
        region: dto.region?.trim() || 'Global',
        contact: dto.contact?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email?.trim(),
        share: dto.share,
        revenue: dto.revenue ?? 0,
        status: dto.status ?? 'active',
      },
    });
    return { ...partner, revenue: Number(partner.revenue) };
  }

  private async ensure(companyId: string, id: string) {
    const p = await this.prisma.partner.findFirst({ where: { id, companyId } });
    if (!p) throw new NotFoundException('Partner not found');
    return p;
  }

  async update(companyId: string, id: string, dto: UpdatePartnerDto) {
    await this.ensure(companyId, id);
    const data: Record<string, unknown> = {};
    for (const k of ['name', 'region', 'contact', 'phone', 'email'] as const) {
      if (dto[k] !== undefined) data[k] = (dto[k] as string).trim();
    }
    if (dto.share !== undefined) data.share = dto.share;
    if (dto.revenue !== undefined) data.revenue = dto.revenue;
    if (dto.status !== undefined) data.status = dto.status;
    const p = await this.prisma.partner.update({ where: { id }, data });
    return { ...p, revenue: Number(p.revenue) };
  }

  async remove(companyId: string, id: string) {
    await this.ensure(companyId, id);
    await this.prisma.partner.delete({ where: { id } });
    return { ok: true };
  }
}

@ApiTags('partners')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.partners.list(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: Principal, @Body() dto: CreatePartnerDto) {
    return this.partners.create(u.companyId, dto);
  }

  @Patch(':id')
  update(@CurrentUser() u: Principal, @Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partners.update(u.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.partners.remove(u.companyId, id);
  }
}

@Module({
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
