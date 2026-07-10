import { Module, Body, Controller, Get, Patch, UseGuards, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Plan, BillingCycle } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';
import { computeBilling, planDef, PLANS } from './billing.constants';

export class UpdateBillingDto {
  @IsOptional() @IsEnum(Plan) plan?: Plan;
  @IsOptional() @IsInt() @Min(1) @Max(500) seats?: number;
  @IsOptional() @IsEnum(BillingCycle) billingCycle?: BillingCycle;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async breakdown(companyId: string) {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw new NotFoundException('Company not found');
    const plan = planDef(c.plan);
    return {
      plans: PLANS,
      current: computeBilling(c.plan, c.seats, c.billingCycle, c.billingSince),
      planFeatures: plan.features,
    };
  }

  async update(companyId: string, dto: UpdateBillingDto) {
    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw new NotFoundException('Company not found');
    // The free tier is a signup trial, not a destination.
    if (dto.plan === 'free' && c.plan !== 'free')
      throw new BadRequestException('You cannot downgrade to the free trial. Contact support instead.');

    const plan = dto.plan ?? c.plan;
    const minSeats = planDef(plan).minSeats;
    const seats = Math.max(dto.seats ?? c.seats, minSeats);
    const billingCycle = dto.billingCycle ?? c.billingCycle;

    const leavingTrial = c.plan === 'free' && plan !== 'free';
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { plan, seats, billingCycle, billingSince: new Date() , ...(leavingTrial ? { trialEndsAt: null } : {}) },
    });
    return { company: updated, current: computeBilling(updated.plan, updated.seats, updated.billingCycle, updated.billingSince) };
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('me')
  breakdown(@CurrentUser() u: Principal) {
    return this.billing.breakdown(u.companyId);
  }

  @Patch('me')
  update(@CurrentUser() u: Principal, @Body() dto: UpdateBillingDto) {
    return this.billing.update(u.companyId, dto);
  }
}

@Module({
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
