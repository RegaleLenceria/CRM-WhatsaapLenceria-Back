import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CampaignsService } from '../../application/services/campaigns.service';
import { CreateCampaignDto } from '../../application/dtos/create-campaign.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { SupabaseStorageService } from '../services/supabase-storage.service';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly supabaseStorageService: SupabaseStorageService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('media'))
  async createAndDispatchCampaign(
    @Body() dto: CreateCampaignDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    if (file) {
      dto.mediaUrl =
        await this.supabaseStorageService.uploadCampaignImage(file);
    }
    return this.campaignsService.createAndDispatchCampaign(dto);
  }
}
