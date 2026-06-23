import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { planDef } from '../billing/billing.constants';

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || 'U';
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private async sign(user: { id: string; companyId: string; email: string }) {
    return this.jwt.signAsync({ sub: user.id, companyId: user.companyId, email: user.email });
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const plan = dto.plan ?? 'starter';
    const seats = Math.max(dto.seats ?? 1, planDef(plan).minSeats);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const company = await this.prisma.company.create({
      data: {
        name: dto.companyName.trim(),
        industry: dto.industry?.trim(),
        country: dto.country?.trim(),
        currencyCode: dto.currencyCode ?? 'PKR',
        currencySymbol: dto.currencySymbol ?? 'Rs',
        capital: dto.capital ?? 0,
        revenue: dto.revenue ?? 0,
        teamSize: dto.teamSize,
        seats,
        plan,
        billingCycle: dto.billingCycle ?? 'monthly',
        users: {
          create: {
            name: dto.ownerName.trim(),
            role: dto.ownerRole?.trim() || 'Founder & CEO',
            email: dto.email.trim().toLowerCase(),
            passwordHash,
          },
        },
      },
      include: { users: true },
    });

    const owner = company.users[0];
    const token = await this.sign({ id: owner.id, companyId: company.id, email: owner.email });
    return { token, user: this.publicUser(owner), company: this.publicCompany(company) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { company: true },
    });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    const token = await this.sign({ id: user.id, companyId: user.companyId, email: user.email });
    return { token, user: this.publicUser(user), company: this.publicCompany(user.company) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { company: true } });
    if (!user) throw new UnauthorizedException();
    return { user: this.publicUser(user), company: this.publicCompany(user.company) };
  }

  private publicUser(u: { id: string; name: string; role: string; email: string }) {
    return { id: u.id, name: u.name, role: u.role, email: u.email, initials: initialsFrom(u.name) };
  }

  private publicCompany(c: any) {
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
}
