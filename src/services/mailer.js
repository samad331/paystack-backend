const nodemailer=require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, 
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false 
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
});

// Verify async without blocking startup
transporter.verify().then(() => {
    console.log('SMTP server is ready to send emails');
}).catch(error => {
    console.warn('SMTP verification failed (non-blocking):', error.message);
});

async function send_Email({ to, subject, text }) {
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to,
        subject,
        text
    };

    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
        console.error('SMTP credentials not configured');
        throw new Error('Email service not configured. Missing GMAIL_USER or GMAIL_PASS');
    }

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', to);
        return info;
    } catch (error) {
        console.error('Error sending email to', to, ':', error.message);
        throw error;
    }
}

module.exports = { send_Email };
