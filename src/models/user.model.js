// models/user.model.js - Keep it simple, data-focused
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    lastname: { type: String, required: true },
    firstname: { type: String, required: true },
    middlename: { type: String },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,

      validate: {
        validator: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        },
        message: props => `${props.value} is not a valid email address!`,
      },
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    phone: {
      type: String,
      default: null,
      sparse: true,
    },
    dateOfBirth: { type: Date, default: null },
    zipCode: { type: String, default: null },
    address: { type: String, default: null },
    city: { type: String, default: null },

    role: {
      type: String,
      enum: [
        'patient',
        'receptionist',
        'nurse',
        'doctor',
        'admin',
        'superadmin',
      ],
      default: 'patient',
    },

    gender: {
      type: String,
      lowercase: true,
    },

    department: {
      type: String, // Store as string since it's from external service
      default: null,
    },

    idVerificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IdVerification',
    },

    emergencyContact: {
      type: String,
    },

    emergencyPhone: {
      type: String,
      unique: true,
      default: null,
    },

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }, // For Active/Inactive status

    faceEnrollmentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    faceEnrollmentData: mongoose.Schema.Types.Mixed,
    faceEnrollmentError: String,

    // Registration timestamps
    registrationStarted: {
      type: Date,
      default: Date.now,
    },
    registrationCompleted: Date,
  },
  { timestamps: true }
);

userSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;

  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);

  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
});
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);
export default User;
