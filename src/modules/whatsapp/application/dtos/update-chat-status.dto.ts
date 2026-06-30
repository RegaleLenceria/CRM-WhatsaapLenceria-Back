import { IsString, IsIn } from 'class-validator';

export class UpdateChatStatusDto {
  @IsString()
  @IsIn(['pendiente', 'en_atencion', 'cerrado'])
  status: string;
}
