import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value as string[];
  })
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
