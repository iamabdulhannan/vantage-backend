import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, AddEntryDto } from './customers.dto';
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

  @Post(':id/entries')
  addEntry(@CurrentUser() u: Principal, @Param('id') id: string, @Body() dto: AddEntryDto) {
    return this.customers.addEntry(u.companyId, id, dto);
  }
}
