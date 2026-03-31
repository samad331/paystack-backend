require('dotenv').config();
const express = require('express');
const ports = process.env.PORT || 3005;
const db = require('./config/database');
const path = require('path');
const authController = require('./controllers/auth.controller');
const PaystackController = require('./controllers/paystack.controller');
const cors= require("cors");
const AuthMiddleware = require('./middleware/auth.middleware');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());


db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        username TEXT NOT NULL,
        VerificationToken TEXT NOT NULL,
        isVerified INTEGER NOT NULL DEFAULT 0,
        VerificationTokenExpiry INTEGER NOT NULL,
        balance REAL DEFAULT 0,
        reference TEXT,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        sender_id INTEGER,
        sender_email TEXT,
        reference TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (sender_id) REFERENCES users(id)
    )`);

    // Backfill columns for existing databases created before sender details were added
    db.all("PRAGMA table_info('transactions')", (err, columns) => {
        if (err) {
            console.error('Failed to inspect transactions table:', err);
            return;
        }

        const hasSenderId = columns.some((col) => col.name === 'sender_id');
        const hasSenderEmail = columns.some((col) => col.name === 'sender_email');

        if (!hasSenderId) {
            db.run('ALTER TABLE transactions ADD COLUMN sender_id INTEGER', (alterErr) => {
                if (alterErr) {
                    console.error('Failed to add sender_id column:', alterErr);
                }
            });
        }

        if (!hasSenderEmail) {
            db.run('ALTER TABLE transactions ADD COLUMN sender_email TEXT', (alterErr) => {
                if (alterErr) {
                    console.error('Failed to add sender_email column:', alterErr);
                }
            });
        }
    });
});

app.get('/', (req, res) => {
  res.send('Welcome to the Paystack Backend API');
});
app.post('/register', (req, res) => authController.register(req, res));
app.post('/login', (req, res) => authController.login(req, res));
app.get('/verify/:token', (req, res) => authController.verifyEmail(req, res));
app.post('/send-password-reset', (req, res) => authController.sendPasswordReset(req, res));
app.post('/reset-password', (req, res) => authController.resetPassword(req, res));
``
app.post('/paystack/fund-wallet',AuthMiddleware.verifyToken,AuthMiddleware.checkVerifiedEmail,(req, res) => PaystackController.fundWallet(req, res));

app.get('/paystack/verify-payment', (req, res) => PaystackController.verifyPayment(req, res));
app.get('/paystack/transaction-history',AuthMiddleware.verifyToken,AuthMiddleware.checkVerifiedEmail,(req, res) => PaystackController.transactionHistory(req, res));
app.get('/paystack/received-transfers',AuthMiddleware.verifyToken,AuthMiddleware.checkVerifiedEmail,(req, res) => PaystackController.getReceivedTransfers(req, res));
app.get('/paystack/balance',AuthMiddleware.verifyToken,AuthMiddleware.checkVerifiedEmail,(req, res) => PaystackController.getBalance(req, res));
app.post('/paystack/transfer-funds',AuthMiddleware.verifyToken,AuthMiddleware.checkVerifiedEmail,(req, res) => PaystackController.transferFunds(req, res));





app.listen(ports, () => {
  console.log(`Server is running on port ${ports}`);
  
});