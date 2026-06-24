import { EntryKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

// Treat empty / whitespace-only strings coming from optional form fields as "not provided",
// so a blank email/phone doesn't fail validation and silently drop the whole request.
const EmptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class CreateCustomerDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @EmptyToUndefined() @IsString() business?: string;
  @IsOptional() @EmptyToUndefined() @IsString() phone?: string;
  @IsOptional() @EmptyToUndefined() @IsEmail() email?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
  @IsOptional() @IsIn(['get', 'give']) openingKind?: 'get' | 'give';
}

export class AddEntryDto {
  @IsEnum(EntryKind) kind!: EntryKind; // gave | got
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() memo?: string;
}

export class UpdateEntryDto {
  @IsOptional() @IsEnum(EntryKind) kind?: EntryKind;
  @IsOptional() @IsNumber() @IsPositive() amount?: number;
  @IsOptional() @IsString() memo?: string;
}
