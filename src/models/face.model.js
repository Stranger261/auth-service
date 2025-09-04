import mongoose from 'mongoose';

const faceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    facialEmbedding: {
      type: String, // Or Array of Numbers, depending on the AFRS output
      required: true,
    },
    source: {
      type: String,
      enum: ['selfie', 'id_card', 'kiosk'],
      required: true,
    },
    imageRef: {
      type: String, // Reference to the stored image file URL
      required: true,
    },
  },
  { timestamps: true }
);

const Face = mongoose.model('Face', faceSchema);

export default Face;
