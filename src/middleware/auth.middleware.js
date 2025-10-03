import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';
import User from '../models/user.model.js';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const authenticate = async (req, _, next) => {
  let token = null;

  // 1. Get token from cookie or Authorization header
  if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  } else if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Unauthorized. Token missing.', 401));
  }

  try {
    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Fetch user
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(
        new AppError('The user belonging to this token no longer exists.', 401)
      );
    }

    // 4. Attach to req
    req.user = currentUser;
    req.token = token;

    next();
  } catch (error) {
    next(new AppError('Forbidden. Invalid token.', 403));
  }
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      throw new AppError('Access denied.', 403);

    next();
  };
};

export const protectInternalApi = (req, res, next) => {
  // Get the secret key from a custom request header
  const providedKey = req.headers['x-internal-api-key'];

  if (!providedKey || providedKey !== INTERNAL_API_KEY) {
    // If the key is missing or incorrect, deny access
    return next(
      new AppError(
        'Forbidden: You are not authorized to access this resource.',
        403
      )
    );
  }

  // If the key is correct, proceed to the controller
  next();
};
