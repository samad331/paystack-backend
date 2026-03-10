// test-send.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
  tls: { rejectUnauthorized: false }
});

(async () => {
  try {
    console.log('verifying transporter...');
    await transporter.verify();
    console.log('transporter verified');
    const info = await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: 'Test email from paystack-project',
      text: 'This is a test email'
    });
    console.log('sendMail info:', info);
  } catch (err) {
    console.error('SMTP test error:', err);
    process.exit(1);
  }
})();