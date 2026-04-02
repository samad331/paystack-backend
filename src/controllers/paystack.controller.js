
const axios = require('axios');
const db = require('../config/database');

class PaystackController {
    static async fundWallet(req, res) {
        try {
            const { email, amount } = req.body;
            const user = req.verifiedUser;

            const response = await axios.post(
                "https://api.paystack.co/transaction/initialize",
                {
                    email,
                    amount: amount * 100,
                    metadata: { 
                        user_id: user.id,
                        custom_fields: [
                            {
                                display_name: "Funded Amount",
                                variable_name: "funded_amount",
                                value: amount
                                
                            }
                        ]
                    },
                    callback_url: `${(process.env.FRONTEND_BASE_URL || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')}/payment/verify`
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    },
                }
            );
            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO transactions (user_id, sender_email, reference, amount, status, type) VALUES (?, ?, ?, ?, ?, ?)',
                    [user.id, email, response.data.data.reference, amount, 'pending', 'credit'],
                    (err) => {
                        if (err) reject(err);
                        resolve();
                    }
                );
            });

            res.json(response.data);
        } catch (err) {
            console.error('Error funding wallet:', err);
            res.status(500).json({ error: 'Failed to initiate payment' });
        }
    }

    static async verifyPayment(req, res) {
        try {
            const reference = req.query.reference;
            
            const verifyResponse = await axios.get(
                `https://api.paystack.co/transaction/verify/${reference}`,
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    },
                }
            );

            if (verifyResponse.data.data.status === 'success') {
                const amount = verifyResponse.data.data.metadata.custom_fields[0].value;
                const userId = verifyResponse.data.data.metadata.user_id;

                // Check if transaction is already completed
                const existingTransaction = await new Promise((resolve, reject) => {
                    db.get(
                        'SELECT status FROM transactions WHERE reference = ?',
                        [reference],
                        (err, row) => {
                            if (err) reject(err);
                            resolve(row);
                        }
                    );
                });

                // If already completed, don't update balance again
                if (existingTransaction?.status === 'completed') {
                    return res.json({ 
                        status: 'success',
                        message: 'Payment already verified',
                        balance: amount
                    });
                }

                await new Promise((resolve, reject) => {
                    db.run('BEGIN TRANSACTION');
                    
                    db.run(
                        'UPDATE transactions SET status = ? WHERE reference = ?',
                        ['completed', reference],
                        (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            db.run(
                                'UPDATE users SET balance = balance + ? WHERE id = ?',
                                [amount, userId],
                                (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }
                                    
                                    db.run('COMMIT');
                                    resolve();
                                }
                            );
                        }
                    );
                });

                res.json({ 
                    status: 'success',
                    message: 'Payment verified and balance updated successfully',
                    balance: amount
                });
            } else {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE transactions SET status = ? WHERE reference = ?',
                        ['failed', reference],
                        (err) => {
                            if (err) reject(err);
                            resolve();
                        }
                    );
                });

                res.status(400).json({
                    status: 'failed',
                    message: 'Payment verification failed'
                });
            }
        } catch (err) {
            console.error('Error verifying payment:', err);
            res.status(500).json({ error: 'Failed to verify payment' });
        }
    }

    static async getBalance(req, res) {
        try {
            const user = req.verifiedUser;
            
            const result = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT balance FROM users WHERE id = ?',
                    [user.id],
                    (err, row) => {
                        if (err) reject(err);
                        resolve(row);
                    }
                );
            });

            res.json({
                status: 'success',
                data: {
                    balance: result.balance
                }
            });
        } catch (err) {
            console.error('Error fetching balance:', err);
            res.status(500).json({ error: 'Failed to fetch balance' });
        }
    }

    static async transactionHistory(req, res) {
        try {
            const user = req.verifiedUser;

            const result = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT * FROM transactions WHERE user_id = ?',
                    [user.id],
                    (err, rows) => {
                        if (err) reject(err);
                        resolve(rows);
                    }
                );
            });

            res.json({
                status: 'success',
                data: {
                    transactions: result,
                }
            });
        } catch (err) {
            console.error('Error fetching transaction history:', err);
            res.status(500).json({ error: 'Failed to fetch transaction history' });
        }
    }

   static async getReceivedTransfers(req, res) {
    try {
        const user = req.verifiedUser;

        const result = await new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    t.id,
                    t.amount,
                    t.status,
                    t.type,
                    t.sender_id,
                          COALESCE(t.sender_email, u.email, receiver.email) AS sender_email,
                    t.reference,
                    t.created_at
                 FROM transactions t
                 LEFT JOIN users u ON u.id = t.sender_id
                      LEFT JOIN users receiver ON receiver.id = t.user_id
                 WHERE t.user_id = ? AND t.type = ?
                 ORDER BY t.created_at DESC`,
                [user.id, 'credit'],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                }
            );
        });

        res.json({
            status: 'success',
            data: {
                transfers: result,
            }
        });
    } catch (err) {
        console.error('Error fetching received transfers:', err);
        res.status(500).json({ error: 'Failed to fetch received transfers' });
    }
}
    static async transferFunds(req, res) {
        try {
            const { recipientEmail, amount } = req.body;
            const user = req.verifiedUser;

            if (!recipientEmail || !amount || amount <= 0) {
                return res.status(400).json({ error: 'Invalid recipient email or amount' });
            }

            // First, fetch sender's current balance
            const senderData = await new Promise((resolve, reject) => {
                db.get('SELECT id, balance, email FROM users WHERE id = ?', [user.id], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            if (!senderData) {
                return res.status(404).json({ error: 'Sender not found' });
            }

            if (senderData.balance < amount) {
                return res.status(400).json({ error: `Insufficient balance. Your balance is ₦${senderData.balance.toLocaleString()}` });
            }

            await new Promise((resolve, reject) => {
                db.get('SELECT id, balance, email FROM users WHERE email = ?', [recipientEmail], (err, recipient) => {
                    if (err) {
                        console.error('Database error:', err);
                        return reject(err);
                    }
                    if (!recipient) {
                        return reject(new Error('Recipient not found'));
                    }

                    db.run('BEGIN TRANSACTION', (err) => {
                        if (err) return reject(err);

                        const senderEmail = senderData.email || user.email;

                        db.run(
                            'UPDATE users SET balance = balance - ? WHERE id = ?',
                            [amount, user.id],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }

                                db.run(
                                    'UPDATE users SET balance = balance + ? WHERE id = ?',
                                    [amount, recipient.id],
                                    (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            return reject(err);
                                        }

                                        db.run(
                                            'INSERT INTO transactions (user_id, sender_id, sender_email, reference, amount, status, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                            [user.id, user.id, senderEmail, `transfer-${Date.now()}`, amount, 'completed', 'debit'],
                                            (err) => {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    return reject(err);
                                                }

                                                db.run(
                                                    'INSERT INTO transactions (user_id, sender_id, sender_email, reference, amount, status, type) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                                    [recipient.id, user.id, senderEmail, `receive-${Date.now()}`, amount, 'completed', 'credit'],
                                                    (err) => {
                                                        if (err) {
                                                            db.run('ROLLBACK');
                                                            return reject(err);
                                                        }

                                                        db.run('COMMIT', (err) => {
                                                            if (err) {
                                                                db.run('ROLLBACK');
                                                                return reject(err);
                                                            }
                                                            resolve();
                                                        });
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                });
            });

            res.json({ status: 'success', message: 'Transfer completed successfully' });
        } catch (err) {
            console.error('Error transferring funds:', err);
            res.status(500).json({ error: err.message || 'Failed to transfer funds' });
        }
    }
}

module.exports = PaystackController;
