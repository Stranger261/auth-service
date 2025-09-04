import amqp from 'amqplib';

let channel;

export const connectRabbitMQ = async () => {
  try {
    const connect = await amqp.connect(
      process.env.RABBITMQ_URI || 'amqp://rabbitmq:5672'
    );

    channel = await connect.createChannel();
    console.log('Connected to RabbitMQ');
  } catch (error) {
    console.log(error.message || 'Something went wrong');
  }
};

export const getChannel = () => {
  if (!channel) throw new Error('RabbitMQ channel is not initialized');

  return channel;
};
