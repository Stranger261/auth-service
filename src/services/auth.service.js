import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import IdVerification from '../models/idVerifcation.model.js';
import AppError from '../utils/AppError.js';
import User from '../models/user.model.js';
import { publishMessage } from '../events/producers/auth.producers.js';
import { sendOTPEmail } from '../utils/sendOTP.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Otp from '../models/otp.model.js';

const AFRS_SERVICE_URL =
  process.env.AFRS_SERVICE_URL || 'http://host.docker.internal:8010';

export const login = async (username, password) => {
  const user = await User.findOne({ username, isDraft: false }).select(
    'password username role'
  );

  if (!user) throw new AppError('Username not found.', 404);
  const match = await bcryptjs.compare(password, user.password);

  if (!match) throw new AppError('Incorrect password.', 400);

  const token = jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  return {
    id: user._id,
    username: user.username,
    role: user.role,
    token,
  };
};

const sendFaceEnrollment = async (userId, name, email, imageFile) => {
  console.log('Sending face enrollment data...');

  try {
    const formData = new FormData();

    formData.append('image', imageFile.buffer, {
      filename: imageFile.originalname || `${Date.now()}-face.jpg`,
      contentType: imageFile.mimetype || 'image/jpeg',
    });
    formData.append('person_id', userId.toString());
    formData.append('name', name);
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

    return response.data;
  } catch (error) {
    console.error('Face enrollment failed:', error.message);
    throw new Error('Failed to enroll face.');
  }
};

const uploadIdImageToStorage = async imageFile => {
  console.log('Saving ID image to local storage...');

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filename = `${imageFile.fieldname}-${Date.now()}-${
    imageFile.originalname
  }`;
  const filePath = path.join(uploadsDir, filename);

  await fs.promises.writeFile(filePath, imageFile.buffer);

  return filePath;
};

const extractDataFromId = async imageFile => {
  console.log(
    'Sending ID card image to OCR microservice for data extraction...'
  );

  const filename = imageFile.originalname || `${Date.now()}-temp.jpg`;
  const tempFilePath = path.join(process.cwd(), 'uploads', filename);

  try {
    await fs.promises.writeFile(tempFilePath, imageFile.buffer);
    const fileStream = fs.createReadStream(tempFilePath);
    const formData = new FormData();
    formData.append('image', fileStream, {
      filename: imageFile.originalname,
      contentType: imageFile.mimetype,
    });
    const response = await axios.post(`${AFRS_SERVICE_URL}/api/ocr`, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    await fs.promises.unlink(tempFilePath);
    return response.data;
  } catch (error) {
    if (fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath);
    }

    if (error.response && error.response.status === 400) {
      console.error(
        'OCR Error: OCR failed, sending to manual verification queue.'
      );
      throw new AppError(
        'Image submitted for manual verification. We will notify you when your account is ready.',
        202
      );
    }

    console.error('OCR Error:', error.message);
    throw new AppError('Failed to extract data from ID card.', 500);
  }
};

const cleanupUploadedFile = async filePath => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error('Failed to cleanup file:', error);
  }
};

// Async wrapper to handle operations after user creation
const handlePostRegistrationTasks = async (
  userId,
  fullname,
  email,
  imageFile,
  otpCode
) => {
  // Run these operations asynchronously but don't wait for them
  setTimeout(async () => {
    try {
      // Try face enrollment
      console.log(`Starting post-registration tasks for user ${userId}`);

      await sendFaceEnrollment(userId, fullname, email, imageFile);
      console.log(`Face enrollment completed for user ${userId}`);

      // Update user status on success
      await User.findByIdAndUpdate(userId, {
        faceEnrollmentStatus: 'completed',
      });
    } catch (error) {
      console.error(
        `Face enrollment failed for user ${userId}:`,
        error.message
      );

      // Mark as failed
      await User.findByIdAndUpdate(userId, {
        faceEnrollmentStatus: 'failed',
        faceEnrollmentError: error.message,
      });
    }

    try {
      // Send OTP email
      await sendOTPEmail(email, otpCode);
      console.log(`OTP email sent to ${email}`);

      // Mark OTP as sent
      await Otp.findOneAndUpdate(
        { userId, otpCode },
        { emailSent: true, sentAt: new Date() }
      );
    } catch (error) {
      console.error(`Failed to send OTP email to ${email}:`, error.message);
    }
  }, 100); // Small delay to ensure transaction is committed
};

export const registerStep1 = async (
  username,
  fullname,
  email,
  password,
  role = 'patient',
  imageFile
) => {
  // Check for existing NON-DRAFT users only
  const existingUser = await User.findOne({
    $or: [
      { username, isDraft: false },
      { email, isDraft: false },
    ],
  });

  if (existingUser) {
    if (existingUser.username === username) {
      throw new AppError('Username already exists.', 400);
    }
    if (existingUser.email === email) {
      throw new AppError('Email already exists.', 400);
    }
  }

  // Your existing file processing code...
  const idCardImageRef = await uploadIdImageToStorage(imageFile);
  const idExtractedData = await extractDataFromId(imageFile);
  const hashedPassword = await bcryptjs.hash(password, 10);

  // Create user (it's draft by default)
  const user = await User.create({
    username,
    email,
    fullname,
    password: hashedPassword,
    role: role,
    isDraft: true, // This is the key change
    isVerified: false,
    faceEnrollmentStatus: 'pending',
  });

  // Your existing IdVerification and OTP code...
  const idVerification = await IdVerification.create({
    userId: user._id,
    idCardImageRef: idCardImageRef,
    idVerificationStatus: 'Pending',
    idExtractedData: idExtractedData,
  });

  user.idVerificationId = idVerification._id;
  await user.save();

  const otpCode = crypto.randomInt(100000, 999999).toString();
  await Otp.create({
    userId: user._id,
    otpCode: otpCode,
  });

  // Your background task for face enrollment and email...
  handlePostRegistrationTasks(user._id, fullname, email, imageFile, otpCode);

  return user;
};

export const verifyOtp = async (userId, otpCode) => {
  if (!userId || !otpCode) {
    throw new AppError('User ID and OTP are required.', 400);
  }

  const otpRecord = await Otp.findOne({ userId, otpCode });

  if (!otpRecord) {
    throw new AppError('Invalid or expired OTP.', 400);
  }

  await Otp.deleteOne({ _id: otpRecord._id });

  return {
    message: 'OTP verified. You may now proceed with ID and face verification.',
  };
};

// Helper function to get registration status
export const getRegistrationStatus = async userId => {
  const user = await User.findById(userId).select(
    'faceEnrollmentStatus isVerified'
  );

  const otp = await Otp.findOne({ userId }).select('emailSent');

  return {
    userId,
    faceEnrollmentStatus: user?.faceEnrollmentStatus || 'unknown',
    isVerified: user?.isVerified || false,
    otpEmailSent: otp?.emailSent || false,
  };
};

export const completeVerification = async userId => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Make the user "real" - this is when they appear in your system
  user.isDraft = false;
  user.isVerified = true;
  await user.save();

  return {
    message: 'Account verification completed successfully!',
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  };
};
