import express from 'express';
import multer from 'multer';

import {
  loginUser,
  logoutUser,
  registerUser,
  verify,
  verifyUser,
} from '../controllers/auth-controller.js';
import { authenticate, authorizeRoles } from '../middleware/auth.middleware.js';
import upload from '../middleware/multer.js';

const router = express.Router();

router.post('/login', loginUser);

router.post('/register', upload.single('imageFile'), registerUser);

router.post('/logout', authenticate, logoutUser);

router.post('/verify-otp', verify);

router.post('/verify-user', verifyUser);

export default router;
