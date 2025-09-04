import dotenv from 'dotenv';

import app from './app.js';
import { connectMongoDB } from './config/mongodb.js';
import { connectRabbitMQ } from './config/rabbitmq.js';
dotenv.config();
const PORT = process.env.PORT || 8000;

const startServer = async () => {
  try {
    await connectMongoDB();
    await connectRabbitMQ();

    app.listen(PORT, () => console.log(`Server is working at PORT: ${PORT}`));
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

startServer();
