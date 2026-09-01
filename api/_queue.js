import { QueueClient } from '@vercel/queue';

const queue = new QueueClient();
export const { handleNodeCallback } = queue;
