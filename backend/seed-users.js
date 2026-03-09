import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const USERS = [
  { name: 'Viewer', login: 'viewer', role: 'viewer', password: 'View@2026' },
  { name: 'Auditor', login: 'auditor', role: 'auditor', password: 'Audit@2026' },
  { name: 'Admin', login: 'admin', role: 'admin', password: 'Admin@2026' },
];

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'server1',
  database: process.env.DB_NAME || 'transpoters',
  waitForConnections: true,
  connectionLimit: 5,
});

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const u of USERS) {
      await conn.query(
        'INSERT INTO users (name, login, role, password_hash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), password_hash=VALUES(password_hash)',
        [u.name, u.login, u.role, u.password]
      );
    }
    await conn.commit();
    console.log('Seeded users: viewer / auditor / admin');
  } catch (err) {
    await conn.rollback();
    console.error('Seeding users failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
