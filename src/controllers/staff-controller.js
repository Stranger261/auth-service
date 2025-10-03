// controllers/userController.js
import { asyncHandler } from '../middleware/asyncHandler.js';
import { messageSender } from '../utils/messageSender.js';

import {
  findAllUserStaffs,
  findUserStaffById,
  createNewUserStaff,
  updateUserStaffById,
  deleteUserStaffById,
  getUserStaffStatistics,
  getAllDepartments,
  getRolesByDepartment,
} from '../services/auth.service.js';

// Get all users with filters
export const getAllUsers = asyncHandler(async (req, res) => {
  const { role, search, department, status, page = 1, limit = 10 } = req.query;

  const filters = {};
  if (role && role !== 'all') filters.role = role;
  if (department) filters.department = department;
  if (status) filters.isActive = status === 'Active';

  const users = await findAllUserStaffs(filters, search, page, limit);

  const retrunData = {
    data: users.data,
    pagination: {
      total: users.total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(users.total / limit),
    },
  };

  messageSender(200, 'Successfully retrieved all users.', retrunData, res);
});

// Get user by ID
export const getUserById = asyncHandler(async (req, res) => {
  const user = await findUserStaffById(req.params.id);

  messageSender(200, 'Successfully retrieved all users.', user, res);
});

// Create new user
export const createUser = asyncHandler(async (req, res) => {
  const userData = req.body;

  const newUser = await createNewUserStaff(userData);

  messageSender(200, 'User created successfully.', newUser, res);
});

// Update user
export const updateUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;
  const updateData = req.body;

  const updatedUser = await updateUserStaffById(userId, updateData);

  messageSender(200, 'User updated successfully.', updatedUser, res);
});

// Delete user (soft delete)
export const deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  const deletedUser = await deleteUserStaffById(userId);

  messageSender(200, 'User deleted successfully.', deletedUser, res);
});

// Get user statistics
export const getUserStats = async (req, res) => {
  const stats = await getUserStaffStatistics();

  messageSender(200, 'Retrieved Successfully.', stats, res);
};

// Get all departments
export const getDepartments = asyncHandler(async (req, res) => {
  const departments = await getAllDepartments();

  messageSender(200, 'Retrieved Successfully.', departments, res);
});

// Get roles for a specific department
export const getDepartmentRoles = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  const roles = await getRolesByDepartment(departmentId);
  console.log('cotnroller', roles);

  messageSender(200, 'Retrieved Successfully.', roles, res);
});
