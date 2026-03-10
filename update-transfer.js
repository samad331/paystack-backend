const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);


db.all('SELECT id, user_id, sender_id, sender_email, type, amount FROM transactions WHERE type = "credit" LIMIT 10', [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    
    console.log('\n=== Current Received Transfers ===');
    console.log(rows);
    
    db.run(`
        UPDATE transactions 
        SET sender_email = (SELECT email FROM users WHERE users.id = transactions.sender_id)
        WHERE sender_id IS NOT NULL 
        AND sender_email IS NULL
    `, [], function(err) {
        if (err) {
            console.error('Update error:', err);
            return;
        }
        
        console.log(`\n✓ Updated ${this.changes} transactions with sender emails`);
        
        // Check again after update
        db.all('SELECT id, user_id, sender_id, sender_email, type, amount FROM transactions WHERE type = "credit" LIMIT 10', [], (err, rows) => {
            if (err) {
                console.error('Error:', err);
                return;
            }
            
            console.log('\n=== After Update ===');
            console.log(rows);
            db.close();
        });
    });
});