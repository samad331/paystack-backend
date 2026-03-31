'use strict';

const db = require('../config/database');
const jwt = require('jsonwebtoken');
const { send_Email } = require('../services/mailer');

class AuthController {
    async register(req, res) {
        const {email, username, password} = req.body;
        if (!email || !username || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (password.length < 9) {
            return res.status(400).json({ error: 'Password must be at least 9 characters long' });
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{9,}$/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' });
        }
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        if (username.length < 6 || username.length > 10) {
            return res.status(400).json({ error: 'Username must be between 6 and 10 characters long' });
        }

        const token = jwt.sign({ email, username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        const tokenExpiry = Date.now() + (60 * 60 * 1000); 

        const emailquery = 'SELECT * FROM users WHERE email = ? OR username = ?';
        db.get(emailquery, [email, username], (err, row) => {
            if (err) {
                console.error('Database error during email check:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (row) {
                return res.status(400).json({ error: 'Email or Username already exists' });
            }

            db.run(
                'INSERT INTO users (email, username, password, VerificationToken, isVerified, VerificationTokenExpiry) VALUES (?, ?, ?, ?, ?, ?)',
                [email, username, password, token, 0, tokenExpiry],
                async function(err) {
                    if (err) {
                        console.error('Database error during insertion:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    
                    const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const apiBaseUrl = (process.env.BASE_URL || requestBaseUrl).replace(/\/$/, '');
                    const verificationUrl = `${apiBaseUrl}/verify?token=${encodeURIComponent(token)}`;

                    if(process.env.SEND_EMAIL==='true') {
                        try {
                            console.log('[MAIL] SEND_EMAIL is enabled, attempting to send verification email to:', email);
                            const subject = 'Verify your email';
                            const text = `Please click the following link to verify your email: ${verificationUrl}`;

                            await send_Email({ 
                                to: email, 
                                subject, 
                                text 
                            });
                            console.log('[MAIL] Verification email sent successfully to:', email);
                        } catch (error) {
                            console.error('[MAIL] Failed to send verification email to', email, ':', error.message);
                            return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
                        }
                    } else {
                        console.warn('[MAIL] SEND_EMAIL is not enabled. Skipping verification email for:', email);
                    }

                    res.status(201).json({
                        status: 'successful',
                        message: 'User registered successfully',
                        data: {
                            id: this.lastID,
                            email,
                            username,
                            verificationUrl
                        }
                    });
                }
            );
        });
    }

    async login(req, res) {
        const { userid, password } = req.body;
        if (!userid || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        
        const query = 'SELECT * FROM users WHERE (email = ? OR username = ?) AND password = ?';
        db.get(query, [userid, userid, password], (err, row) => {
            if (err) {
                console.error('Database error during login:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!row) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }
            
            if (row.isVerified === 0 || row.isVerified === '0' || row.isVerified === false) {
                return res.status(403).json({ error: 'Email not verified. Please verify your email before logging in' });
            }

            const token = jwt.sign({ id: row.id, email: row.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
            res.status(200).json({ 
                status: 'successful', 
                message: 'Login successful', 
                data: { token } 
            });
        });
    }

    async verifyEmail(req, res) {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ error: 'Invalid token' });
            }

            const { email } = decoded;
            db.run('UPDATE users SET isVerified = 1 WHERE email = ?', [email], (err) => {
                if (err) {
                    console.error('Database error during verification:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.status(200).json({ 
                    status: 'successful', 
                    message: 'Email verified successfully'
                });
            });
        });
    }

    async sendPasswordReset(req, res) {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
            if (err) {
                console.error('Database error during password reset request:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
            const requestBaseUrl = `${req.protocol}://${req.get('host')}`;
            const apiBaseUrl = (process.env.BASE_URL || requestBaseUrl).replace(/\/$/, '');
            const resetUrl = `${apiBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
            const subject = 'Password Reset';
            const text = `Please click the following link to reset your password: ${resetUrl}`;

            send_Email({ to: email, subject, text })
                .catch((error) => {
                    console.error('Error sending password reset email:', error);
                });

            res.status(200).json({ 
                status: 'successful', 
                message: 'Password reset email sent'
            });
        });
    }

    async resetPassword(req, res) {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }

            const { id } = decoded;
            const updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
            db.run(updateQuery, [newPassword, id], function(err) {
                if (err) {
                    console.error('Database error during password reset:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }
                res.status(200).json({ 
                    status: 'successful', 
                    message: 'Password reset successfully'
                });
            });
        });
    }
}


const authController = new AuthController();


module.exports = authController;
