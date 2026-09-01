import { handleNodeCallback } from './_queue.js';
import { collectorPost } from './_collector.js';

export default handleNodeCallback(
  async (message, metadata) => {
    await collectorPost(message);
    console.log('shopping event delivered', {
      event_id: message?.event_id,
      event_type: message?.event_type,
      delivery_count: metadata.deliveryCount
    });
  },
  {
    visibilityTimeoutSeconds: 60,
    retry: (_error, metadata) => ({
      afterSeconds: Math.min(300, Math.max(5, 2 ** Math.min(metadata.deliveryCount, 6) * 5))
    })
  }
);
