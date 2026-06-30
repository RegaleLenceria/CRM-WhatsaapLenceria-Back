import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  birthday?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  favoriteProduct?: string;
}
