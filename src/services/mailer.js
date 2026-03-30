const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Configure SendGrid if API key is available
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Create Nodemailer transporter for Gmail fallback
const createTransporter = () => {
    if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
        return nodemailer.createTransport({
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
    }
    return null;
};

const transporter = createTransporter();

// Verify async without blocking startup
if (transporter) {
    transporter.verify().then(() => {
        console.log('Gmail SMTP server is ready to send emails');
    }).catch(error => {
        console.warn('Gmail SMTP verification failed (non-blocking):', error.message);
    });
}

async function send_Email({ to, subject, text }) {
    // Use SendGrid if configured (preferred)
    if (process.env.SENDGRID_API_KEY) {
        try {
            const msg = {
                to,
                from: process.env.FROM_EMAIL || 'noreply@yourdomain.com', // Replace with your verified sender
                subject,
                text
            };

            const result = await sgMail.send(msg);
            console.log('SendGrid email sent successfully to:', to);
            return result;
        } catch (error) {
            console.error('SendGrid error:', error.message);
            throw error;
        }
    }

    // Fallback to Gmail SMTP
    if (!transporter) {
        throw new Error('Email service not configured. Set SENDGRID_API_KEY or GMAIL_USER/GMAIL_PASS');
    }

    const mailOptions = {
        from: process.env.GMAIL_USER,
        to,
        subject,
        text
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Gmail SMTP email sent successfully to:', to);
        return info;
    } catch (error) {
        console.error('Gmail SMTP error sending to', to, ':', error.message);
        throw error;
    }
}

module.exports = { send_Email };
