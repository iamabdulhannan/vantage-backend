import { Plan, BillingCycle } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Product-wide password policy - keep in sync with the app (src/utils/password.ts).
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
export const PASSWORD_MESSAGE = 'Password must be at least 8 characters and include a letter and a number';

export class RegisterDto {
  // Company
  @IsString() @MinLength(2) companyName!: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() currencySymbol?: string;
  @IsOptional() @IsNumber() @Min(0) capital?: number;
  @IsOptional() @IsNumber() @Min(0) revenue?: number;
  @IsOptional() @IsString() teamSize?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) seats?: number;
  @IsOptional() @IsEnum(Plan) plan?: Plan;
  @IsOptional() @IsEnum(BillingCycle) billingCycle?: BillingCycle;

  // Owner
  @IsString() @MinLength(2) ownerName!: string;
  @IsOptional() @IsString() ownerRole?: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8, { message: PASSWORD_MESSAGE }) @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;
}

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}

export class ForgotPasswordDto {
  @IsEmail() email!: string;
}

export class ResetPasswordDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) @MaxLength(6) code!: string;
  @IsString() @MinLength(8, { message: PASSWORD_MESSAGE }) @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;
}
