import mongoose from 'mongoose';

const idVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    idCardImageRef: {
      type: String, // Reference to the stored image file
      required: true,
    },
    idVerificationStatus: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Manual Review'],
      default: 'Pending',
    },
    idExtractedData: {
      fullName: { type: String },
      dob: { type: Date },
      idNumber: { type: String },
    },
  },
  { timestamps: true }
);

const IdVerification = mongoose.model('IdVerification', idVerificationSchema);

export default IdVerification;
