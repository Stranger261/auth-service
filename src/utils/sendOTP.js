import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTPEmail = async (receiverEmail, otp) => {
  const mailOptions = {
    from: `"HVill Hospital" <${process.env.EMAIL_USER}>`,
    to: receiverEmail,
    subject: 'Your OTP Verification Code',
    html: `<p>Your verification OTP code is: <b>${otp}</b></p>`,
  };

  await transporter.sendMail(mailOptions);
};
