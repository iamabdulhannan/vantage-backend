import { Injectable, NotFoundException } from '@nestjs/common';
import { Customer, LedgerEntry, Reminder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, AddEntryDto, UpdateEntryDto, UpdateCustomerDto, AddReminderDto, UpdateReminderDto } from './customers.dto';

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

type WithEntries = Customer & { entries: LedgerEntry[]; reminders?: Reminder[] };

/**
 * Reliability from promise history: kept vs missed vs rescheduled.
 * A pending reminder more than a day overdue counts as missed-so-far.
 */
function reliabilityOf(reminders: Reminder[]) {
  const now = Date.now();
  let kept = 0,
    missed = 0,
    rescheduled = 0,
    overdue = 0;
  for (const r of reminders) {
    if (r.status === 'kept') kept++;
    else if (r.status === 'missed') missed++;
    else if (r.status === 'rescheduled') rescheduled++;
    else if (r.status === 'pending' && now - new Date(r.dueAt).getTime() > 24 * 3600 * 1000) overdue++;
  }
  const bad = missed + overdue;
  const total = kept + bad + rescheduled;
  let label = 'New';
  if (total > 0) {
    if (rescheduled >= 3) label = 'Reschedules often';
    else if (bad === 0 && rescheduled <= 1 && kept > 0) label = 'Reliable';
    else if (kept / total >= 0.6) label = 'Usually pays';
    else label = 'Risky';
  }
  return { label, kept, missed: bad, rescheduled };
}

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
    const reminders = [...(c.reminders ?? [])].sort(
      (a, b) => new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime(),
    );
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
      reminders: reminders.map((r) => ({
        id: r.id,
        dueAt: r.dueAt,
        note: r.note ?? undefined,
        status: r.status,
        createdAt: r.createdAt,
      })),
      reliability: reliabilityOf(c.reminders ?? []),
    };
  }

  async list(companyId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { companyId },
      include: { entries: true, reminders: true },
      orderBy: { createdAt: 'desc' },
    });
    const serialized = customers.map((c) => this.serialize(c));
    const youllGet = serialized.filter((c) => c.balance > 0).reduce((s, c) => s + c.balance, 0);
    const youllGive = serialized.filter((c) => c.balance < 0).reduce((s, c) => s + Math.abs(c.balance), 0);
    return { customers: serialized, youllGet, youllGive };
  }

  async get(companyId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId }, include: { entries: true, reminders: true } });
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
      include: { entries: true, reminders: true },
    });
    return this.serialize(customer);
  }

  async update(companyId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      data.initials = initialsFrom(dto.name);
    }
    if (dto.business !== undefined) data.business = dto.business.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim();
    if (dto.email !== undefined) data.email = dto.email.trim();
    await this.prisma.customer.update({ where: { id }, data });
    return this.get(companyId, id);
  }

  async remove(companyId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException('Customer not found');
    // Entries cascade-delete with the customer (onDelete: Cascade).
    await this.prisma.customer.delete({ where: { id } });
    return { ok: true };
  }

  async addEntry(companyId: string, id: string, dto: AddEntryDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const gave = dto.kind === 'gave';
    // A payment received fulfils the customer's oldest open promise.
    if (!gave) {
      const open = await this.prisma.reminder.findFirst({
        where: { customerId: id, status: 'pending' },
        orderBy: { dueAt: 'asc' },
      });
      if (open) await this.prisma.reminder.update({ where: { id: open.id }, data: { status: 'kept' } });
    }
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

  private async ensureEntry(companyId: string, customerId: string, entryId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({
      where: { id: entryId, customerId, customer: { companyId } },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    return entry;
  }

  async updateEntry(companyId: string, customerId: string, entryId: string, dto: UpdateEntryDto) {
    await this.ensureEntry(companyId, customerId, entryId);
    await this.prisma.ledgerEntry.update({
      where: { id: entryId },
      data: {
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.memo !== undefined ? { memo: dto.memo.trim() } : {}),
      },
    });
    await this.prisma.customer.update({ where: { id: customerId }, data: { lastActivity: new Date() } });
    return this.get(companyId, customerId);
  }

  async removeEntry(companyId: string, customerId: string, entryId: string) {
    await this.ensureEntry(companyId, customerId, entryId);
    await this.prisma.ledgerEntry.delete({ where: { id: entryId } });
    return this.get(companyId, customerId);
  }

  async addReminder(companyId: string, customerId: string, dto: AddReminderDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId } });
    if (!customer) throw new NotFoundException('Customer not found');
    // Setting a new date while one is open = the customer rescheduled.
    await this.prisma.reminder.updateMany({
      where: { customerId, status: 'pending' },
      data: { status: 'rescheduled' },
    });
    await this.prisma.reminder.create({
      data: { customerId, dueAt: new Date(dto.dueAt), note: dto.note?.trim() || null },
    });
    return this.get(companyId, customerId);
  }

  async updateReminder(companyId: string, customerId: string, reminderId: string, dto: UpdateReminderDto) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id: reminderId, customerId, customer: { companyId } },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');
    await this.prisma.reminder.update({ where: { id: reminderId }, data: { status: dto.status } });
    return this.get(companyId, customerId);
  }
}
