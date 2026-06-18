const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const connectionString = process.env.DATABASE_URL || null;

let pgPool = null;
function getPgPool() {
  if (!pgPool) {
    const poolConfig = { connectionString };
    const shouldUseSsl = process.env.NODE_ENV === 'production' || /sslmode=(require|verify-full|prefer)/i.test(connectionString);
    if (shouldUseSsl) {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
    pgPool = new Pool(poolConfig);
  }
  return pgPool;
}

async function ensureColumn(pool, table, column, definition) {
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
}

function openDatabase() {
  const pool = getPgPool();
  return {
    get: async (sql, ...params) => {
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      const result = await pool.query(pgSql, params);
      return result.rows[0] || null;
    },
    all: async (sql, ...params) => {
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      const result = await pool.query(pgSql, params);
      return result.rows;
    },
    run: async (sql, ...params) => {
      let pgSql = sql;
      let paramIndex = 1;
      pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
      return await pool.query(pgSql, params);
    },
    close: async () => {
      // Do not close the pool; reuse it across calls.
    }
  };
}

async function initDatabase() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured. Set DATABASE_URL to a PostgreSQL connection string.');
  }

  const pool = getPgPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','security','student')),
      phone_number TEXT,
      registration_number TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('lost','found')),
      status TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      assigned_to INTEGER,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      image_path TEXT,
      contact_phone TEXT,
      claim_requested_by INTEGER,
      claim_requested_at TIMESTAMP WITH TIME ZONE,
      archived_at TIMESTAMP WITH TIME ZONE,
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS claims (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      resolved_at TIMESTAMP WITH TIME ZONE,
      FOREIGN KEY(report_id) REFERENCES reports(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await ensureColumn(pool, 'users', 'phone_number', 'TEXT');
  await ensureColumn(pool, 'users', 'registration_number', 'TEXT');
  await ensureColumn(pool, 'reports', 'image_path', 'TEXT');
  await ensureColumn(pool, 'reports', 'contact_phone', 'TEXT');
  await ensureColumn(pool, 'reports', 'claim_requested_by', 'INTEGER');
  await ensureColumn(pool, 'reports', 'claim_requested_at', 'TIMESTAMP WITH TIME ZONE');
  await ensureColumn(pool, 'reports', 'archived_at', 'TIMESTAMP WITH TIME ZONE');

  const adminPasswordHash = await bcrypt.hash('THEFABULOUS', 10);
  const securityPasswordHash = await bcrypt.hash('security@24', 10);
  const studentPasswordHash = await bcrypt.hash('student@24', 10);

  await pool.query(
    'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role',
    ['System Administrator', 'admin@kabianga.ac.ke', 'admin', adminPasswordHash, 'admin']
  );

  await pool.query(
    'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role',
    ['Security Officer', 'security@kabianga.ac.ke', 'security', securityPasswordHash, 'security']
  );

  await pool.query(
    'INSERT INTO users (full_name, email, username, password, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role',
    ['Sample Student', 'student@students.kabianga.ac.ke', 'student', studentPasswordHash, 'student']
  );
}

module.exports = { openDatabase, initDatabase };
