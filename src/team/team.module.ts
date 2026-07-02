import {
  Module,
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_RULE, PASSWORD_MESSAGE } from '../auth/auth.dto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || 'U';
}

const Lower = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class AddMemberDto {
  @IsString() @MinLength(2) name!: string;
  @Lower() @IsEmail() email!: string;
  @IsString() @MinLength(8, { message: PASSWORD_MESSAGE }) @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;
  @IsOptional() @IsString() role?: string;
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  /** The owner is the first user created for the company. */
  private async ownerId(companyId: string) {
    const owner = await this.prisma.user.findFirst({ where: { companyId }, orderBy: { createdAt: 'asc' } });
    return owner?.id;
  }

  async list(companyId: string) {
    const [users, company] = await Promise.all([
      this.prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.company.findUnique({ where: { id: companyId } }),
    ]);
    const ownerId = users[0]?.id;
    const seats = company?.seats ?? users.length;
    return {
      members: users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email,
        initials: initialsFrom(u.name),
        isOwner: u.id === ownerId,
        joinedAt: u.createdAt,
      })),
      seats: { total: seats, used: users.length, available: Math.max(0, seats - users.length) },
    };
  }

  async add(companyId: string, dto: AddMemberDto) {
    const [count, company, existing] = await Promise.all([
      this.prisma.user.count({ where: { companyId } }),
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    ]);
    if (!company) throw new NotFoundException('Company not found');
    if (existing) throw new ConflictException('An account with this email already exists');
    if (count >= company.seats) {
      throw new BadRequestException(
        `All ${company.seats} seats are in use. Add more seats in Billing before inviting another member.`,
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const u = await this.prisma.user.create({
      data: {
        companyId,
        name: dto.name.trim(),
        role: dto.role?.trim() || 'Team member',
        email: dto.email,
        passwordHash,
      },
    });
    return { id: u.id, name: u.name, role: u.role, email: u.email, initials: initialsFrom(u.name), isOwner: false, joinedAt: u.createdAt };
  }

  async remove(companyId: string, memberId: string, currentUserId: string) {
    const member = await this.prisma.user.findFirst({ where: { id: memberId, companyId } });
    if (!member) throw new NotFoundException('Member not found');
    if (memberId === (await this.ownerId(companyId))) throw new ForbiddenException('The owner cannot be removed');
    if (memberId === currentUserId) throw new BadRequestException('You cannot remove yourself');
    await this.prisma.user.delete({ where: { id: memberId } });
    return { ok: true };
  }
}

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.team.list(u.companyId);
  }

  @Post()
  add(@CurrentUser() u: Principal, @Body() dto: AddMemberDto) {
    return this.team.add(u.companyId, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.team.remove(u.companyId, id, u.userId);
  }
}

@Module({
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
