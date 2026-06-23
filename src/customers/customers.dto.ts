import { EntryKind } from '@prisma/client';
import { IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() business?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsIn(['get', 'give']) openingKind?: 'get' | 'give';
}

export class AddEntryDto {
  @IsEnum(EntryKind) kind!: EntryKind; // gave | got
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() memo?: string;
}
