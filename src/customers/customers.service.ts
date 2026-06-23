import { Injectable, NotFoundException } from '@nestjs/common';
import { Customer, LedgerEntry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, AddEntryDto } from './customers.dto';

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

type WithEntries = Customer & { entries: LedgerEntry[] };

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Net balance: gave (owed to us) minus got (paid). >0 => "you'll get". */
  private serialize(c: WithEntries) {
    let gave = 0;
    let got = 0;
    const entries = [...c.entries]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((e) => {
        const amt = Number(e.amount);
        if (e.kind === 'gave') gave += amt;
        else got += amt;
        return {
          id: e.id,
          date: e.date,
          memo: e.memo,
          kind: e.kind,
          amount: amt,
          balance: gave - got,
        };
      });
    const balance = gave - got;
    return {
      id: c.id,
      name: c.name,
      business: c.business,
      phone: c.phone,
      email: c.email,
      initials: c.initials,
      lastActivity: c.lastActivity,
      totalGave: gave,
      totalGot: got,
      balance,
      status: balance === 0 ? 'settled' : balance > 0 ? 'current' : 'advance',
      entries,
    };
  }

  async list(companyId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { companyId },
      include: { entries: true },
      orderBy: { createdAt: 'desc' },
    });
    const serialized = customers.map((c) => this.serialize(c));
    const youllGet = serialized.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);
    const youllGive = serialized.filter((c) => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);
    return { customers: serialized, youllGet, youllGive };
  }

  async get(companyId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId }, include: { entries: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.serialize(customer);
  }

  async create(companyId: string, dto: CreateCustomerDto) {
    const hasOpening = dto.openingBalance && dto.openingBalance > 0;
    const customer = await this.prisma.customer.create({
      data: {
        companyId,
        name: dto.name.trim(),
        business: dto.business?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email?.trim(),
        initials: initialsFrom(dto.name),
        entries: hasOpening
          ? {
              create: {
                memo: 'Opening balance',
                // "get" => customer owes us (gave); "give" => we hold their advance (got)
                kind: dto.openingKind === 'give' ? 'got' : 'gave',
                amount: dto.openingBalance!,
              },
            }
          : undefined,
      },
      include: { entries: true },
    });
    return this.serialize(customer);
  }

  async addEntry(companyId: string, id: string, dto: AddEntryDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const gave = dto.kind === 'gave';
    await this.prisma.$transaction([
      this.prisma.ledgerEntry.create({
        data: {
          customerId: id,
          memo: dto.memo?.trim() || (gave ? 'You gave' : 'You got'),
          kind: dto.kind,
          amount: dto.amount,
        },
      }),
      this.prisma.customer.update({ where: { id }, data: { lastActivity: new Date() } }),
      this.prisma.activity.create({
        data: {
          companyId,
          who: customer.name,
          what: gave ? dto.memo?.trim() || 'Credit extended' : 'Payment received',
          amount: dto.amount,
          type: gave ? 'invoice' : 'payment',
        },
      }),
    ]);

    return this.get(companyId, id);
  }
}
