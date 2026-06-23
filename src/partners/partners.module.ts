import { Module, Body, Controller, Get, Post, UseGuards, Injectable } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

export class CreatePartnerDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsInt() @Min(0) @Max(100) share!: number;
  @IsOptional() @IsNumber() revenue?: number;
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
      },
    });
    return { ...partner, revenue: Number(partner.revenue) };
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
}

@Module({
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
