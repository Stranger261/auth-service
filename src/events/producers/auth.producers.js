import { getChannel } from '../../config/rabbitmq.js';

export const publishAuthEvent = async (eventType, payload) => {
  const channel = await getChannel();

  await channel.assertQueue(eventType);

  channel.sendToQueue(eventType, Buffer.from(JSON.stringify(payload)));
};

export const publishMessage = async (exchange, routingKey, message) => {
  const channel = await getChannel();

  if (channel) {
    channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)));
    console.log(
      `[x] Sent message to exchange '${exchange}' with key '${routingKey}'`
    );
  }
};
