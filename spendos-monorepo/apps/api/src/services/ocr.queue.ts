import { Queue, Worker, Job } from 'bullmq';
import { redis, isRedisMock } from './redis.service';
import Tesseract from 'tesseract.js';

// In-memory store for mocked jobs
const mockJobStore = new Map<string, any>();

async function mockWorkerProcess(jobData: any) {
  const imageBuffer = Buffer.from(jobData.bufferData, 'base64');
  const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng');
  
  const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  let amount = null;
  let date = null;
  let merchant = lines.length > 0 ? lines[0] : null;

  const amountRegex = /(?:total|amount|sum)?\s*(?:rs\.?|₹|\$|inr)?\s*(\d+(?:,\d{3})*(?:\.\d{2}))/i;
  for (const line of lines) {
    const match = line.match(amountRegex);
    if (match && match[1]) {
      amount = match[1].replace(/,/g, '');
    }
  }

  const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
  for (const line of lines) {
    const match = line.match(dateRegex);
    if (match && match[1]) {
      date = match[1];
    }
  }

  return { amount, date, merchant, rawText: text };
}

export const ocrQueue = isRedisMock ? ({
  add: async (name: string, data: any) => {
    const id = Math.random().toString(36).substring(7);
    mockJobStore.set(id, { id, state: 'active', returnvalue: null });
    // Process asynchronously
    setTimeout(async () => {
      try {
        const result = await mockWorkerProcess(data);
        mockJobStore.set(id, { id, state: 'completed', returnvalue: result });
      } catch (err: any) {
        console.error(`Mock OCR failed:`, err);
        mockJobStore.set(id, { id, state: 'failed', failedReason: err.message });
      }
    }, 100);
    return { id };
  },
  getJob: async (jobId: string) => {
    const job = mockJobStore.get(jobId);
    if (!job) return null;
    return {
      id: job.id,
      returnvalue: job.returnvalue,
      isCompleted: async () => job.state === 'completed',
      isFailed: async () => job.state === 'failed',
    } as any;
  }
} as unknown as Queue) : new Queue('ocr-queue', { connection: redis as any });

export function startOcrWorker() {
  if (isRedisMock) {
    console.log("[BullMQ] Running in Mock mode (no redis), worker disabled.");
    return null;
  }

  const ocrWorker = new Worker('ocr-queue', async (job: Job) => {
    return await mockWorkerProcess(job.data);
  }, { connection: redis as any });

  ocrWorker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`OCR Job ${job?.id} failed with error ${err.message}`);
  });
  
  return ocrWorker;
}
