import mongoose from 'mongoose';

const loginLogsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  firstname: { type: String, trim: true },
  lastname: { type: String, trim: true },
  email: { type: String, lowercase: true, trim: true },
  loggedInAt: { type: Date, default: Date.now },
});

const loginLogs = mongoose.model('loginLogs', loginLogsSchema);

export default loginLogs;
