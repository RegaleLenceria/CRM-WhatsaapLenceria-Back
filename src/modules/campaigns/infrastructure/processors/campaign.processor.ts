import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WhatsappService } from '../../../whatsapp/infrastructure/services/whatsapp.service';

interface SendCampaignMessageJobData {
  phone: string;
  text: string;
  mediaUrl?: string;
  deviceId: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Processor('campaigns_queue')
export class CampaignProcessor extends WorkerHost {
  constructor(private readonly whatsappService: WhatsappService) {
    super();
  }

  async process(job: Job<unknown, unknown, string>): Promise<void> {
    const data = job.data as SendCampaignMessageJobData;
    const { phone, text, mediaUrl, deviceId } = data;

    console.log(
      `Processing campaign job ${job.id}: sending message to ${phone} using device ${deviceId}...`,
    );

    await this.whatsappService.sendMessage(deviceId, phone, text, mediaUrl);

    // Antispam human-like delay (10-15 seconds)
    const delay = Math.floor(Math.random() * (15000 - 10000 + 1) + 10000);
    console.log(`Message sent successfully. Sleeping for ${delay / 1000}s...`);
    await sleep(delay);
  }
}
