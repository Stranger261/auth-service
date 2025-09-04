import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  completeVerification,
  login,
  registerStep1,
  verifyOtp,
} from '../services/auth.service.js';
import { messageSender } from '../utils/messageSender.js';

export const loginUser = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await login(username, password);

  res.cookie('token', user.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 24 * 60 * 60 * 1000,
  });

  messageSender(200, 'Login successfully.', user, res);
});

export const registerUser = asyncHandler(async (req, res) => {
  const { username, fullname, email, password, role } = req.body;
  const imageFile = req.file;

  try {
    const registeredUser = await registerStep1(
      username,
      fullname,
      email,
      password,
      role,
      imageFile
    );

    messageSender(
      201,
      'Step 1: Success.',
      { userId: registeredUser._id, user: registeredUser },
      res
    );
  } catch (error) {
    if (error.statusCode === 202) {
      // Handle the new manual verification status
      messageSender(
        202,
        'Registration submitted for manual verification. Please check your email for updates.',
        null,
        res
      );
    } else {
      // Handle all other errors
      throw error;
    }
  }
});

export const verify = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body; // <-- Get userId from the request body

  const verified = await verifyOtp(userId, otp);

  messageSender(200, 'OTP verified successfully.', verified, res);
});

export const logoutUser = asyncHandler(async (req, res) => {
  res.clearCookie('token', {
    sameSite: 'Strict',
    httpOnly: true,
  });

  messageSender(200, 'Logout successfully.', '', res);
});

export const verifyUser = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const newUser = await completeVerification(userId);

  messageSender(200, 'User Verification successfully.', newUser, res);
});
