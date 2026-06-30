import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  deviceIds: string[];

  @IsString()
  @IsOptional()
  mediaUrl?: string;

  @IsString()
  @IsOptional()
  genderFilter?: string;

  @IsString()
  @IsOptional()
  productFilter?: string;
}
