import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private readonly supabaseClient: ReturnType<typeof createClient>;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'SUPABASE_URL or SUPABASE_KEY is not defined in the environment configuration.',
      );
    }

    this.supabaseClient = createClient(supabaseUrl, supabaseKey);
  }

  async uploadCampaignImage(file: Express.Multer.File): Promise<string> {
    const fileExt = file.originalname.split('.').pop() || '';
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const fileName = `${Date.now()}-${uniqueId}.${fileExt}`;

    const { error } = await this.supabaseClient.storage
      .from('campaigns_media')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new BadRequestException(
        `Failed to upload image to Supabase: ${error.message}`,
      );
    }

    const { data: publicUrlData } = this.supabaseClient.storage
      .from('campaigns_media')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  }
}
