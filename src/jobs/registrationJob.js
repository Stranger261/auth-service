import Bull from 'bull';
import { sendOTPEmail } from '../utils/sendOTP.js';
import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import axios from 'axios';
import FormData from 'form-data';

const AFRS_SERVICE_URL =
  process.env.AFRS_SERVICE_URL || 'http://host.docker.internal:8010';

// Redis configuration
const redisConfig = {
  redis: {
    port: process.env.REDIS_PORT || 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
};

// Initialize queues
export const faceEnrollmentQueue = new Bull('face enrollment', {
  ...redisConfig,
  defaultJobOptions: {
    ...redisConfig.defaultJobOptions,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const emailQueue = new Bull('email', {
  ...redisConfig,
  defaultJobOptions: {
    ...redisConfig.defaultJobOptions,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

// Face enrollment job processor
faceEnrollmentQueue.process('sendFaceEnrollment', async job => {
  const { userId, fullname, email, imageBuffer, originalname, mimetype } =
    job.data;

  console.log(`Processing face enrollment for user ${userId}...`);

  try {
    const formData = new FormData();

    formData.append('image', imageBuffer, {
      filename: originalname || `${Date.now()}-face.jpg`,
      contentType: mimetype || 'image/jpeg',
    });
    formData.append('person_id', userId.toString());
    formData.append('name', fullname);
    formData.append('email', email);
    formData.append('source', 'id_card');
    formData.append('force_enroll', 'false');

    const response = await axios.post(
      `${AFRS_SERVICE_URL}/api/enroll/from_id`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'x-api-key': process.env.FACE_SERVICE_API_KEY,
        },
        timeout: 30000,
      }
    );

    // Update user status on success
    await User.findByIdAndUpdate(userId, {
      faceEnrollmentStatus: 'completed',
      faceEnrollmentData: response.data,
    });

    console.log(`Face enrollment completed for user ${userId}`);
  } catch (error) {
    console.error(`Face enrollment failed for user ${userId}:`, error.message);

    // Mark as failed after all retries exhausted
    if (job.attemptsMade >= job.opts.attempts) {
      await User.findByIdAndUpdate(userId, {
        faceEnrollmentStatus: 'failed',
        faceEnrollmentError: error.message,
      });
    }

    throw error; // This will trigger retry
  }
});

// Email job processor
emailQueue.process('sendOTPEmail', async job => {
  const { email, otpCode, userId } = job.data;

  console.log(`Sending OTP email to ${email}...`);

  try {
    await sendOTPEmail(email, otpCode);

    // Mark OTP as sent
    await Otp.findOneAndUpdate(
      { userId },
      { emailSent: true, sentAt: new Date() }
    );

    console.log(`OTP sent successfully to ${email}`);
  } catch (error) {
    console.error(`Failed to send OTP to ${email}:`, error);
    throw error;
  }
});
