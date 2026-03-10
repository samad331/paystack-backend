const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../database.sqlite');


const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1); 
    }
    console.log('Database connected at:', dbPath);
});

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    // avoid SQLITE_BUSY errors by setting a busy timeout
    db.run('PRAGMA busy_timeout = 5000');
    // keep simple journal mode; WAL can be used if you need better concurrency
    db.run('PRAGMA journal_mode = DELETE'); 
});

module.exports = db;
