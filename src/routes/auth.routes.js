import express from 'express';

import {
  loginUser,
  logoutUser,
  registerUser,
  verifyOtpController,
  getCurrentUser,
  enrollUserHandler,
  verifyFace,
  updateUserHandler,
  validateUser,
  ocrHandler,
  getUserDetails,
} from '../controllers/auth-controller.js';
import {
  authenticate,
  authorizeRoles,
  protectInternalApi,
} from '../middleware/auth.middleware.js';
import upload from '../middleware/multer.js';

const router = express.Router();

router.post('/login', loginUser);

router.post('/register', registerUser);

router.post('/logout', authenticate, logoutUser);

router.post('/verify-otp', verifyOtpController);

router.post('/ocr', authenticate, upload.single('image'), ocrHandler);

router.post(
  '/verify-user-info',
  authenticate,
  upload.single('idPhoto'),
  enrollUserHandler
);

router.post(
  '/bulk',
  // [authenticate, authorizeRoles('receptionist', 'nurse', 'doctor')],
  protectInternalApi,
  getUserDetails
);

router.patch('/complete-verification/:id', authenticate, verifyFace);

router.get('/user/me', authenticate, getCurrentUser);
router.put('/update-user/:id', authenticate, updateUserHandler);

router.get('/internal/verify-user/:id', protectInternalApi, validateUser);

export default router;
