import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      // Removed unique: true - will handle with partial index below
    },

    fullname: { type: String, required: true },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      // Removed unique: true - will handle with partial index below
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ['patient', 'frontdesk', 'nurse', 'doctor', 'admin', 'superadmin'],
      required: true,
      default: 'patient',
    },

    faceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Face',
    },

    idVerificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IdVerification',
    },

    // Registration status fields
    isVerified: {
      type: Boolean,
      default: false,
    },

    isDraft: {
      type: Boolean,
      default: true,
    },

    registrationStep: {
      type: String,
      enum: ['step1', 'step2', 'step3', 'completed'],
      default: 'step1',
    },

    // Face enrollment status
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
  {
    timestamps: true,
  }
);

// Create compound indexes for efficient querying
userSchema.index({ isDraft: 1, isVerified: 1 });
userSchema.index({ isDraft: 1, registrationStep: 1 });

// Partial unique indexes - only enforce uniqueness for non-draft users
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: { isDraft: false },
    name: 'username_unique_non_draft',
  }
);

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { isDraft: false },
    name: 'email_unique_non_draft',
  }
);

// Optional: Index for cleanup queries
userSchema.index({ isDraft: 1, createdAt: 1 });

// Virtual for checking if user is fully registered
userSchema.virtual('isFullyRegistered').get(function () {
  return (
    !this.isDraft && this.isVerified && this.registrationStep === 'completed'
  );
});

// Static method to find only real (non-draft) users
userSchema.statics.findReal = function (filter = {}) {
  return this.find({ ...filter, isDraft: false });
};

// Static method to find draft users
userSchema.statics.findDrafts = function (filter = {}) {
  return this.find({ ...filter, isDraft: true });
};

// Static method to cleanup old draft users
userSchema.statics.cleanupDrafts = function (olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  return this.deleteMany({
    isDraft: true,
    createdAt: { $lt: cutoff },
  });
};

// Instance method to promote draft to real user
userSchema.methods.promoteToRealUser = async function () {
  if (!this.isDraft) {
    throw new Error('User is already a real user');
  }

  // Check for conflicts with existing real users
  const conflicts = await this.constructor.findOne({
    $or: [{ username: this.username }, { email: this.email }],
    isDraft: false,
    _id: { $ne: this._id },
  });

  if (conflicts) {
    throw new Error('Username or email already taken by another user');
  }

  // Promote to real user
  this.isDraft = false;
  this.isVerified = true;
  this.registrationStep = 'completed';
  this.registrationCompleted = new Date();

  return this.save();
};

// Pre-save middleware to set registrationCompleted
userSchema.pre('save', function (next) {
  if (
    this.isModified('isVerified') &&
    this.isVerified &&
    !this.registrationCompleted
  ) {
    this.registrationCompleted = new Date();
  }
  next();
});

const User = mongoose.model('User', userSchema);

export default User;
