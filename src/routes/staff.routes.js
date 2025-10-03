// routes/userRoutes.js
import express from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
  getDepartments,
  getDepartmentRoles,
} from '../controllers/staff-controller.js';

import {
  authenticate,
  authorizeRoles,
  protectInternalApi,
} from '../middleware/auth.middleware.js';

const router = express.Router();

// Statistics
router.get('/stats', getUserStats);

// Department routes
router.get(
  '/departments',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  getDepartments
);
router.get(
  '/departments/:departmentId/roles',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  getDepartmentRoles
);

// User CRUD routes
router.get(
  '/',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  getAllUsers
);
router.get(
  '/:id',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  getUserById
);
router.post(
  '/create',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  createUser
);
router.put(
  '/:id',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  updateUser
);
router.delete(
  '/:id',
  authenticate,
  authorizeRoles('admin', 'superadmin'),
  deleteUser
);

export default router;
