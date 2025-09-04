export const messageSender = (status, message, data, res) =>
  res.status(status).json({ message, success: true, data });
