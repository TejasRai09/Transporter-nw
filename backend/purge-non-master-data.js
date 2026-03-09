import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

// Deletes all data including transporters and vehicles.
// This removes: incidents, evaluations, baselines, logs, users, vehicles, transporters.
// Usage: node purge-non-master-data.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

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

    // Order matters due to FK constraints.
    await conn.query('DELETE FROM incidents');
    await conn.query('DELETE FROM evaluations');
    await conn.query('DELETE FROM baselines');
    await conn.query('DELETE FROM logs');
    await conn.query('DELETE FROM users');
    await conn.query('DELETE FROM vehicles');
    await conn.query('DELETE FROM transporters');

    await conn.commit();
    console.log('Purge complete: removed incidents, evaluations, baselines, logs, users, vehicles, and transporters.');
  } catch (err) {
    await conn.rollback();
    console.error('Purge failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
