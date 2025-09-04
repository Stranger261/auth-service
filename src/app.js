import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import errorHandler from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
);

app.use(cookieParser());

app.use('/', authRoutes);

app.use(errorHandler);

export default app;
