import { Plan, BillingCycle } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  // Company
  @IsString() @MinLength(2) companyName!: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() currencySymbol?: string;
  @IsOptional() @IsString() teamSize?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) seats?: number;
  @IsOptional() @IsEnum(Plan) plan?: Plan;
  @IsOptional() @IsEnum(BillingCycle) billingCycle?: BillingCycle;

  // Owner
  @IsString() @MinLength(2) ownerName!: string;
  @IsOptional() @IsString() ownerRole?: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}
