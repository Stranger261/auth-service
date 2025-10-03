import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  enrollUser,
  faceVerification,
  login,
  registerStep1,
  updateUser,
  verifyOtp,
  validateUserById,
  OCR,
  fetchUserDetails,
} from '../services/auth.service.js';
import { messageSender } from '../utils/messageSender.js';

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await login(email, password);

  res.cookie('jwt', user.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  messageSender(200, 'Login successfully.', user, res);
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json({
    message: 'Success',
    data: req.user,
  });
});

export const registerUser = asyncHandler(async (req, res) => {
  const registeredUser = await registerStep1(req.body);

  messageSender(
    201,
    'Step 1: Success.',
    { userId: registeredUser._id, user: registeredUser },
    res
  );
});

export const verifyOtpController = asyncHandler(async (req, res) => {
  const { userId, otp } = req.body;

  const verified = await verifyOtp(userId, otp);

  messageSender(200, 'OTP verified successfully.', verified, res);
});

export const enrollUserHandler = asyncHandler(async (req, res) => {
  const { id } = req.user;
  const { token } = req;
  const idPhoto = req.file;
  const enrolled = await enrollUser(id, req.body, idPhoto, token);

  messageSender(200, 'Enroll user successfully.', enrolled, res);
});

export const verifyFace = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const verifiedUser = await faceVerification(userId);

  messageSender(200, 'You are now verified user.', verifiedUser, res);
});

export const updateUserHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const updatedUser = await updateUser(id, req.body);

  messageSender(200, 'Updated Successfully.', updatedUser, res);
});

export const logoutUser = asyncHandler(async (req, res) => {
  res.clearCookie('jwt', {
    sameSite: 'Strict',
    httpOnly: true,
  });

  messageSender(200, 'Logout successfully.', '', res);
});

export const validateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const verifiedUser = await validateUserById(id);

  const returnData = {
    role: verifiedUser.role,
    active: verifiedUser.active,
  };

  messageSender(200, 'User verified.', returnData, res);
});

export const ocrHandler = asyncHandler(async (req, res) => {
  const file = req.file;

  const ocrResult = await OCR(file);

  messageSender(200, 'Success.', ocrResult, res);
});

export const getUserDetails = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  const patientDetails = await fetchUserDetails(ids);

  messageSender(200, 'Retrieved Successfully.', patientDetails, res);
});
