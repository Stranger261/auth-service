import jwt from 'jsonwebtoken';
import AppError from '../utils/AppError.js';

export const authenticate = (req, _, next) => {
  const token = req.cookies?.token;

  if (!token) throw new AppError('Unauthorized.', 401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    throw new AppError('Forbidden.', 403);
  }
};

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      throw new AppError('Access denied.', 403);

    next();
  };
};
