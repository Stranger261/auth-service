import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import staffRoutes from './routes/staff.routes.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: ['http://localhost:5173', 'https://core1.health-ease-hospital.com'],
    credentials: true,
  })
);

app.use(cookieParser());

app.use('/', authRoutes);
app.use('/staff', staffRoutes);

app.use(errorHandler);

export default app;
