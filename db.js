const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Allow custom DB_PATH for deployment environments (like Railway Volumes)
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'hisobchi.db');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        lang TEXT DEFAULT NULL,
        phone TEXT DEFAULT NULL,
        name TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create Transactions table
      db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount INTEGER,
        type TEXT, -- 'income' or 'expense'
        category TEXT DEFAULT 'Boshqa',
        description TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(telegram_id)
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

const ensureUserExists = (telegramId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT telegram_id, lang FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
      if (err) return reject(err);
      if (!row) {
        db.run('INSERT INTO users (telegram_id) VALUES (?)', [telegramId], (err) => {
          if (err) return reject(err);
          resolve({ isNew: true, lang: null });
        });
      } else {
        resolve({ isNew: false, lang: row.lang });
      }
    });
  });
};

const getUser = (telegramId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const getUserLang = async (telegramId) => {
  const user = await ensureUserExists(telegramId);
  return user.lang;
};

const setUserLang = async (telegramId, lang) => {
  await ensureUserExists(telegramId);
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET lang = ? WHERE telegram_id = ?', [lang, telegramId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

const setUserPhone = async (telegramId, phone) => {
  await ensureUserExists(telegramId);
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET phone = ? WHERE telegram_id = ?', [phone, telegramId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

const setUserName = async (telegramId, name) => {
  await ensureUserExists(telegramId);
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET name = ? WHERE telegram_id = ?', [name, telegramId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

const addTransaction = async (telegramId, amount, type, category, description) => {
  await ensureUserExists(telegramId);
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO transactions (user_id, amount, type, category, description) VALUES (?, ?, ?, ?, ?)',
      [telegramId, amount, type, category, description],
      function (err) {
        if (err) return reject(err);

        // Update user balance
        const balanceChange = type === 'income' ? amount : -amount;
        db.run(
          'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
          [balanceChange, telegramId],
          (err) => {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      }
    );
  });
};

const getUserBalance = async (telegramId) => {
  await ensureUserExists(telegramId);
  return new Promise((resolve, reject) => {
    db.get('SELECT balance FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.balance : 0);
    });
  });
};

const getRecentTransactions = (telegramId, limit = 10) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT amount, type, category, description, date FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT ?',
      [telegramId, limit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

const getStatsByDate = (telegramId, dateStr) => {
  // dateStr format: 'YYYY-MM-DD' or 'YYYY-MM'
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT type, SUM(amount) as total FROM transactions 
       WHERE user_id = ? AND date LIKE ? 
       GROUP BY type`,
      [telegramId, `${dateStr}%`],
      (err, rows) => {
        if (err) return reject(err);
        const stats = { income: 0, expense: 0 };
        rows.forEach(row => {
          stats[row.type] = row.total;
        });
        resolve(stats);
      }
    );
  });
};

const getExpensesByCategory = (telegramId, dateStr) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT category, SUM(amount) as value FROM transactions 
       WHERE user_id = ? AND type = 'expense' AND date LIKE ? 
       GROUP BY category ORDER BY value DESC`,
      [telegramId, `${dateStr}%`],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

const getIncomesByCategory = (telegramId, dateStr) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT category, SUM(amount) as value FROM transactions 
       WHERE user_id = ? AND type = 'income' AND date LIKE ? 
       GROUP BY category ORDER BY value DESC`,
      [telegramId, `${dateStr}%`],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
};

const deleteAllData = (telegramId) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM transactions WHERE user_id = ?', [telegramId], (err) => {
        if (err) return reject(err);
      });
      db.run('UPDATE users SET balance = 0 WHERE telegram_id = ?', [telegramId], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

module.exports = {
  initDb,
  addTransaction,
  getUserBalance,
  getRecentTransactions,
  getStatsByDate,
  getExpensesByCategory,
  getIncomesByCategory,
  deleteAllData,
  getUser,
  getUserLang,
  setUserLang,
  setUserPhone,
  setUserName
};
