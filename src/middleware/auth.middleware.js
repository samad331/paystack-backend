const jwt = require('jsonwebtoken');
const db = require('../config/database');

class AuthMiddleware {
    static async verifyToken(req, res, next) {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ 
                error: 'Authentication required',
                message: 'Please provide a valid token' 
            });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;
            next();
        } catch (error) {
            return res.status(401).json({ 
                error: 'Invalid token',
                message: 'Your session has expired or is invalid' 
            });
        }
    }

    static async checkVerifiedEmail(req, res, next) {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(400).json({
                error: 'User identification required',
                message: 'Please provide valid authentication'
            });
        }

        try {
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    message: 'Please register first before using Paystack services'
                });
            }

            if (!user.isVerified) {
                return res.status(403).json({
                    error: 'Email not verified',
                    message: 'Please verify your email before using Paystack services'
                });
            }

            req.verifiedUser = user;
            next();
        } catch (error) {
            console.error('Database error:', error);
            return res.status(500).json({
                error: 'Server error',
                message: 'An error occurred while verifying your email status'
            });
        }
    }
}

module.exports = AuthMiddleware;
