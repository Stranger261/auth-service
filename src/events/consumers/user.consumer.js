import { getChannel } from '../../config/rabbitmq.js';
import { QUEUE } from '../queue.js';

export const consumeUserCreated = async () => {
  const channel = getChannel();

  await channel.assertQueue(QUEUE.USER_CREATED);

  channel.consume(QUEUE.USER_CREATED, msg => {
    const data = JSON.parse(msg.content.toString());

    console.log('Recieved user.created: ', data);

    channel.ack(msg);
  });
};
