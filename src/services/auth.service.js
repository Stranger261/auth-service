import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';

import User from '../models/user.model.js';
import Otp from '../models/otp.model.js';
import loginLogs from '../models/logs.model.js';

import AppError from '../utils/AppError.js';
import { sendOTPEmail } from '../utils/sendOTP.js';
import { parseIDFromOCR } from '../utils/ocrParser.js';

import { buffer } from 'stream/consumers';
import { publishMessage } from '../events/producers/auth.producers.js';
import mongoose from 'mongoose';

const appointmentApi = axios.create({
  baseURL: process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:8002',
  withCredentials: true,
  headers: { 'x-internal-api-key': process.env.INTERNAL_API_KEY },
});

export const login = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user) throw new AppError('Email not found.', 404);
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

  await loginLogs.create({
    userId: user._id,
    email: user.email,
    firstname: user.firstname,
    lastname: user.lastname,
  });

  const { password: _password, ...safeUser } = user.toObject();

  return { token, safeUser };
};

export const registerStep1 = async ({
  lastname,
  firstname,
  middlename,
  email,
  password,
  role = 'patient',
  gender,
}) => {
  const existingUser = await User.findOne({ email, isDraft: false });

  if (existingUser) {
    throw new AppError('Email already exists.', 400);
  }

  const hashedPassword = await bcryptjs.hash(password, 10);

  const user = await User.create({
    lastname,
    firstname,
    middlename,
    email,
    password: hashedPassword,
    role,
    gender,
    isDraft: true,
    faceEnrollmentStatus: 'pending',
  });

  await user.save();

  const otpCode = crypto.randomInt(100000, 999999).toString();
  await Otp.create({
    userId: user._id,
    otpCode,
  });

  await sendOTPEmail(email, otpCode);

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

  // Mark user as not draft (finalized)
  await User.findByIdAndUpdate(userId, { isDraft: false });

  return {
    message: 'OTP Verified. Registered successfully.',
  };
};

export const enrollUser = async (id, data, idPhoto, token) => {
  try {
    const user = await User.findById(id);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!idPhoto) {
      throw new AppError('ID photo is required', 400);
    }

    // ✅ Create proper FormData
    const formData = new FormData();
    formData.append('image', idPhoto.buffer, {
      filename: idPhoto.originalname || 'id-photo.jpg',
      contentType: idPhoto.mimetype || 'image/jpeg',
    });
    formData.append('source', 'gov_id');
    console.log(formData.getHeaders());

    console.log('📌 Auth Service: Enrolling face for user:', id);

    const response = await axios.post(
      `${process.env.PATIENT_FACE_BASE_URL}/enroll`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
          ...formData.getHeaders(), // ✅ Important: adds boundary
        },
        withCredentials: true, // ✅ Moved outside headers
        timeout: 30000, // 30 seconds timeout
      }
    );

    console.log('✅ Auth Service: Face enrollment successful:', response.data);

    // ✅ Check response structure
    if (!response.data || response.data.success === false) {
      throw new AppError(
        response.data?.message || 'Face enrollment failed',
        400
      );
    }

    // Update user data
    Object.assign(user, data);
    user.faceEnrollmentStatus = 'completed';
    await user.save();

    return {
      user,
      faceEnrollment: response.data,
    };
  } catch (error) {
    console.error('❌ Auth Service: Face enrollment error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      url: error.config?.url,
    });

    if (error.response?.status === 404) {
      throw new AppError(
        'Face service endpoint not found. Check if face service is running.',
        404
      );
    }

    if (error.response?.status === 409) {
      throw new AppError(
        'User already enrolled or duplicate face detected',
        409
      );
    }

    throw new AppError(
      error.response?.data?.message || 'Face enrollment service unavailable',
      error.response?.status || 500
    );
  }
};

export const faceVerification = async userId => {
  const user = await User.findById(userId);

  if (!user) throw new AppError('User not found.', 404);

  // Check if face was already verified in patient-service
  // if (!user.hasFaceProfile) {
  //   throw new AppError(
  //     'No enrolled face found. Please register your face first.',
  //     400
  //   );
  // }

  user.isVerified = true;
  await user.save();

  return user;
};

export const updateUser = async (id, updatedData) => {
  const updatedUser = await User.findByIdAndUpdate(id, updatedData, {
    new: true,
  });

  return updatedUser;
};

export const validateUserById = async id => {
  const user = await User.findById(id).select('role active');

  if (!user || !user.isActive) {
    return res.status(404).json({ message: 'User not found or inactive.' });
  }

  return user;
};

export const OCR = async file => {
  if (!file) throw new AppError('No image uploaded', 404);

  const ocrUrl = `${process.env.AZURE_OCR_ENDPOINT}/vision/v3.2/read/analyze`;
  const key = process.env.AZURE_OCR_KEY;
  const headers = {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/octet-stream',
  };

  try {
    const response = await axios.post(ocrUrl, file.buffer, { headers });
    const operationLocation = response.headers['operation-location'];
    if (!operationLocation) {
      throw new AppError('No operation-location returned from Azure OCR', 500);
    }

    let result;
    const pollHeaders = { 'Ocp-Apim-Subscription-Key': key };
    for (let i = 0; i < 10; i++) {
      const pollResponse = await axios.get(operationLocation, {
        headers: pollHeaders,
      });
      result = pollResponse.data;
      if (result.status === 'succeeded') break;
      if (result.status === 'failed')
        throw new AppError('Azure OCR failed to process image', 500);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!result || result.status !== 'succeeded') {
      throw new AppError('Timeout waiting for Azure OCR', 500);
    }

    const readResults = result.analyzeResult?.readResults;
    if (!readResults) throw new AppError('No OCR results found.', 500);

    const extractedText = readResults
      .map(page => page.lines.map(line => line.text).join('\n'))
      .join('\n\n'); // Use double newline for text from different pages

    const parsedData = parseIDFromOCR(extractedText);

    return parsedData;
  } catch (error) {
    const azureError = error.response
      ? JSON.stringify(error.response.data)
      : error.message;
    throw new AppError(
      `Error calling Azure OCR API: ${
        error.response?.data?.message || error.message
      }`,
      500
    );
  }
};

export const fetchUserDetails = async ids => {
  const users = await User.find({ _id: { $in: ids } }).select(
    'firstname middlename lastname email phone role'
  );

  if (!users) throw new AppError('User not found.');

  return users;
};

// for staff section
export const fetchDepartmentsFromService = async () => {
  try {
    const response = await appointmentApi.get('/department/view');
    return response.data.data;
  } catch (error) {
    console.error(
      'Error fetching departments from appointment-service:',
      error.message
    );
    throw new Error('Unable to fetch departments from appointment-service');
  }
};

// Fetch department by ID from appointment-service
export const fetchDepartmentById = async departmentId => {
  try {
    const response = await appointmentApi.get(`/department/${departmentId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching department by ID:', error.message);
    return null;
  }
};

// Validate department and role from appointment-service
const validateDepartmentRole = async (departmentId, role) => {
  try {
    const department = await fetchDepartmentById(departmentId);

    if (!department) {
      throw new Error('Invalid department');
    }

    // Define allowed roles per department (based on your frontend mapping)
    const departmentRoleMapping = {
      'Internal Medicine': ['doctor', 'nurse'],
      'IM - Pulmonologist': ['doctor', 'nurse'],
      'IM - Cardiologist': ['doctor', 'nurse'],
      'IM - Nephrologist': ['doctor', 'nurse'],
      'IM - Endocrinologist': ['doctor', 'nurse'],
      'Neuro - Psychiatrist': ['doctor', 'nurse'],
      Dermatologist: ['doctor', 'nurse'],
      Pediatrician: ['doctor', 'nurse'],
      Opthalmologist: ['doctor', 'nurse'],
      'OB GYN': ['doctor', 'nurse'],
      'IM - Gastroenterologist': ['doctor', 'nurse'],
      'Ortho - Surgeon': ['doctor', 'nurse'],
      'ENT - HNS': ['doctor', 'nurse'],
      Surgeon: ['doctor', 'nurse'],
      Urologist: ['doctor', 'nurse'],
      Nursing: ['nurse', 'receptionist'],
      Laboratory: ['nurse'],
      'Front Desk': ['receptionist'],
      // Billing: ['receptionist'],
      // Pharmacy: ['nurse', 'receptionist'],
      // Radiology: ['nurse', 'receptionist'],
      System: ['admin', 'superadmin'],
    };

    const allowedRoles = departmentRoleMapping[department.name] || [];

    if (role && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      throw new Error(
        `Role ${role} is not allowed in department ${department.name}`
      );
    }

    return true;
  } catch (error) {
    throw error;
  }
};

export const findAllUserStaffs = async (
  filters,
  search,
  page = 1,
  limit = 10
) => {
  const query = { ...filters };

  if (search) {
    const orConditions = [
      { firstname: { $regex: search, $options: 'i' } },
      { lastname: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];

    if (mongoose.Types.ObjectId.isValid(search)) {
      orConditions.push({ _id: new mongoose.Types.ObjectId(search) });
    }

    query.$or = orConditions;
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    User.countDocuments(query),
  ]);

  // Fetch department details for each user from appointment-service
  const userStaffWithDepartments = await Promise.all(
    data.map(async staff => {
      if (staff.department) {
        try {
          const department = await fetchDepartmentById(staff.department);
          return {
            ...staff,
            departmentDetails: department || null,
          };
        } catch (error) {
          console.error(
            `Error fetching department for staff ${staff._id}:`,
            error.message
          );
          return { ...staff, departmentDetails: null };
        }
      }
      return { ...staff, departmentDetails: null };
    })
  );

  return { data: userStaffWithDepartments, total };
};

// Find user by ID
export const findUserStaffById = async userStaffId => {
  const staff = await User.findById(userStaffId).select('-password').lean();

  if (!staff) {
    return null;
  }

  // Fetch department details from appointment-service
  if (staff.department) {
    try {
      const department = await fetchDepartmentById(staff.department);
      staff.departmentDetails = department || null;
    } catch (error) {
      console.error('Error fetching department:', error.message);
      staff.departmentDetails = null;
    }
  }

  return staff;
};

// Create New User Staff Function
export const createNewUserStaff = async userStaffData => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      firstname,
      lastname,
      middlename,
      email,
      password,
      phone,
      dateOfBirth,
      gender,
      address,
      city,
      zipCode,
      role,
      department,
      emergencyContact,
      emergencyPhone,
    } = userStaffData;

    // Validate department + role
    if (department && role) {
      await validateDepartmentRole(department, role);
    }

    // Hash password
    const salt = await bcryptjs.genSalt(10);
    const hashedPassword = await bcryptjs.hash(password, salt);

    // Create user
    const newUserStaff = new User({
      firstname,
      lastname,
      middlename,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone,
      dateOfBirth,
      gender: gender?.toLowerCase(),
      address,
      city,
      zipCode,
      role,
      department: department || null,
      emergencyContact,
      emergencyPhone,
      isActive: true,
      isVerified: true,
      registrationStarted: new Date(),
    });

    await newUserStaff.save({ session });

    // External appointment-service profile creation
    if (
      role === 'doctor' ||
      role === 'nurse' ||
      (role === 'receptionist' && department)
    ) {
      try {
        await appointmentApi.post(`/schedule/createProfile`, {
          user: newUserStaff._id.toString(),
          firstname,
          lastname,
          gender,
          department,
          email: email.toLowerCase(),
          role,
          phone,
          specialization: userStaffData.department || 'General',
          medicalLicenseNumber:
            userStaffData.medicalLicenseNumber ||
            `PENDING-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          yearsOfExperience: userStaffData.yearsOfExperience || 0,
          bio: userStaffData.bio || '',
        });
      } catch (error) {
        // rollback because external API failed
        await session.abortTransaction();
        throw new AppError(
          `Failed to create profile in appointment-service: ${error.message}`,
          500
        );
      }
    }

    // Commit transaction if all good
    await session.commitTransaction();

    // Convert to plain object without password
    const userObject = newUserStaff.toObject();
    delete userObject.password;

    if (department) {
      try {
        const departmentDetails = await fetchDepartmentById(department);
        userObject.departmentDetails = departmentDetails;
      } catch {
        userObject.departmentDetails = null;
      }
    }

    return userObject;
  } catch (error) {
    // Rollback if something fails before commit
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    // Always end session
    session.endSession();
  }
};

export const updateUserStaffById = async (userId, updateData) => {
  const {
    firstname,
    lastname,
    middlename,
    email,
    phone,
    dateOfBirth,
    gender,
    address,
    city,
    zipCode,
    role,
    department,
    isActive,
    emergencyContact,
    emergencyPhone,
  } = updateData;

  // Validate department and role combination from appointment-service
  if (department && role) {
    await validateDepartmentRole(department, role);
  }

  const updateFields = {};
  if (firstname) updateFields.firstname = firstname;
  if (lastname) updateFields.lastname = lastname;
  if (middlename !== undefined) updateFields.middlename = middlename;
  if (email) updateFields.email = email.toLowerCase();
  if (phone) updateFields.phone = phone;
  if (dateOfBirth) updateFields.dateOfBirth = dateOfBirth;
  if (gender) updateFields.gender = gender.toLowerCase();
  if (address) updateFields.address = address;
  if (city) updateFields.city = city;
  if (zipCode) updateFields.zipCode = zipCode;
  if (role) updateFields.role = role;
  if (department) updateFields.department = department;
  if (typeof isActive === 'boolean') updateFields.isActive = isActive;
  if (emergencyContact) updateFields.emergencyContact = emergencyContact;
  if (emergencyPhone) updateFields.emergencyPhone = emergencyPhone;

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { $set: updateFields },
    { new: true, runValidators: true }
  )
    .select('-password')
    .lean();

  // Fetch department details
  if (updatedUser && updatedUser.department) {
    try {
      const departmentDetails = await fetchDepartmentById(
        updatedUser.department
      );
      updatedUser.departmentDetails = departmentDetails;
    } catch (error) {
      updatedUser.departmentDetails = null;
    }
  }

  return updatedUser;
};

// Delete user (soft delete by setting isActive to false)
export const deleteUserStaffById = async userId => {
  const userStaff = await User.findByIdAndUpdate(
    userId,
    { $set: { isActive: false } },
    { new: true }
  )
    .select('-password')
    .lean();

  return userStaff;
};

export const getUserStaffStatistics = async () => {
  const [
    totalUsersStaff,
    doctorCount,
    nurseCount,
    receptionistCount,
    adminCount,
    activeUsersStaff,
    inactiveUsersStaff,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'doctor' }),
    User.countDocuments({ role: 'nurse' }),
    User.countDocuments({ role: 'receptionist' }),
    User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: false }),
  ]);

  return {
    total: totalUsersStaff,
    byRole: {
      doctor: doctorCount,
      nurse: nurseCount,
      receptionist: receptionistCount,
      admin: adminCount,
    },
    byStatus: {
      active: activeUsersStaff,
      inactive: inactiveUsersStaff,
    },
  };
};

// Get all departments from appointment-service
export const getAllDepartments = async () => {
  return await fetchDepartmentsFromService();
};

// Get roles by department from appointment-service
export const getRolesByDepartment = async departmentId => {
  try {
    const department = await fetchDepartmentById(departmentId);
    console.log(department);

    if (!department) {
      return null;
    }

    // Define role mapping based on department name
    const departmentRoleMapping = {
      'Internal Medicine': ['doctor', 'nurse'],
      'IM - Pulmonologist': ['doctor', 'nurse'],
      'IM - Cardiologist': ['doctor', 'nurse'],
      'IM - Nephrologist': ['doctor', 'nurse'],
      'IM - Endocrinologist': ['doctor', 'nurse'],
      'Neuro - Psychiatrist': ['doctor', 'nurse'],
      Dermatologist: ['doctor', 'nurse'],
      Pediatrician: ['doctor', 'nurse'],
      Opthalmologist: ['doctor', 'nurse'],
      'OB GYN': ['doctor', 'nurse'],
      'IM - Gastroenterologist': ['doctor', 'nurse'],
      'Ortho - Surgeon': ['doctor', 'nurse'],
      'ENT - HNS': ['doctor', 'nurse'],
      Surgeon: ['doctor', 'nurse'],
      Urologist: ['doctor', 'nurse'],
      Nursing: ['nurse', 'receptionist'],
      'Front Desk': ['receptionist'],
      Laboratory: ['nurse'],
      // Billing: ['receptionist'],
      // Pharmacy: ['nurse', 'receptionist'],
      // Radiology: ['nurse', 'receptionist'],
      System: ['admin', 'superadmin'],
    };

    const allowedRoles = departmentRoleMapping[department.data.name] || [];

    return {
      department: department.data.name,
      departmentId: department.data._id,
      allowedRoles,
    };
  } catch (error) {
    throw error;
  }
};
