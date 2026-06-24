import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, AddEntryDto, UpdateEntryDto, UpdateCustomerDto } from './customers.dto';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Principal } from '../common/principal';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() u: Principal) {
    return this.customers.list(u.companyId);
  }

  @Post()
  create(@CurrentUser() u: Principal, @Body() dto: CreateCustomerDto) {
    return this.customers.create(u.companyId, dto);
  }

  @Get(':id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.customers.get(u.companyId, id);
  }

  @Patch(':id')
  update(@CurrentUser() u: Principal, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(u.companyId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.customers.remove(u.companyId, id);
  }

  @Post(':id/entries')
  addEntry(@CurrentUser() u: Principal, @Param('id') id: string, @Body() dto: AddEntryDto) {
    return this.customers.addEntry(u.companyId, id, dto);
  }

  @Patch(':id/entries/:entryId')
  updateEntry(
    @CurrentUser() u: Principal,
    @Param('id') id: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.customers.updateEntry(u.companyId, id, entryId, dto);
  }

  @Delete(':id/entries/:entryId')
  removeEntry(@CurrentUser() u: Principal, @Param('id') id: string, @Param('entryId') entryId: string) {
    return this.customers.removeEntry(u.companyId, id, entryId);
  }
}
