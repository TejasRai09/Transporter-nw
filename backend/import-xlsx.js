import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import mysql from 'mysql2/promise';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Basic column mapping: adjust here if your headers differ.
// Case-insensitive field picker to handle header variants
const pick = (row, keys) => {
  const normalized = {};
  for (const [k, v] of Object.entries(row)) {
    normalized[k.toLowerCase()] = v;
  }
  for (const key of keys) {
    const val = normalized[key.toLowerCase()];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
};
const DEFAULT_SEASON = process.env.SEASON || process.argv[3] || 'SS25-26';
const INPUT_FILE = process.env.XLSX_PATH || process.argv[2];

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`File not found: ${INPUT_FILE}`);
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'server1',
  database: process.env.DB_NAME || 'transpoters',
  waitForConnections: true,
  connectionLimit: 10,
});

async function ensureTables(conn) {
  const ddl = `
    CREATE TABLE IF NOT EXISTS transporters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      season VARCHAR(32) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transporter_id INT NOT NULL,
      vehicle_no VARCHAR(80) NOT NULL,
      year INT,
      sl_no VARCHAR(80),
      truck_type VARCHAR(80),
      driver_name VARCHAR(120),
      driver_mobile VARCHAR(32),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_vehicle_transporter FOREIGN KEY (transporter_id) REFERENCES transporters(id) ON DELETE CASCADE
    );
  `;
  for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
    await conn.query(stmt);
  }
}

async function main() {
  console.log(`Using season: ${DEFAULT_SEASON}`);
  const workbook = xlsx.readFile(INPUT_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  if (!rows.length) {
    console.error('No rows found in spreadsheet');
    process.exit(1);
  }

  // Debug: show headers and first few rows to diagnose mapping issues
  const headers = Object.keys(rows[0] || {});
  console.log(`Sheet: ${sheetName}`);
  console.log('Detected headers:', headers);
  console.log('First 3 rows (trimmed):', rows.slice(0, 3));

  const conn = await pool.getConnection();
  try {
    await ensureTables(conn);

    // Map transporter name+season to IDs (cache)
    const transporterIdByKey = new Map();
    const seenKeys = new Set();
    let insertedTransporters = 0;
    let insertedVehicles = 0;

    let skipped = 0;
    for (const row of rows) {
      const name = pick(row, ['Transporter Name', 'transporter', 'name', 'Transporter', 'Transporter name']);
      const vehicleNo = pick(row, ['Vehicle No', 'vehicle_no', 'Vehicle', 'Truck Number', 'Truck no']);
      if (!name || !vehicleNo) {
        skipped++;
        continue; // skip incomplete
      }

      const season = pick(row, ['Season', 'season']) || DEFAULT_SEASON;
      const yearStr = pick(row, ['Year', 'year']);
      const year = yearStr ? Number(yearStr) || null : null;
      const slNo = pick(row, ['SL No', 'sl_no', 'Sl No']);
      const truckType = pick(row, ['Truck Type', 'truck_type', 'Type']);
      const driverName = pick(row, ['Driver Name', 'driver_name']);
      const driverMobile = pick(row, ['Driver Mobile', 'driver_mobile', 'Mobile']);

      const key = `${name}__${season}`;
      let tid = transporterIdByKey.get(key);
      if (!tid && !seenKeys.has(key)) {
        const [rowsExisting] = await conn.query('SELECT id FROM transporters WHERE name = ? AND season = ? LIMIT 1', [name, season]);
        if (rowsExisting.length) {
          tid = rowsExisting[0].id;
        } else {
          const [ins] = await conn.query('INSERT INTO transporters (name, season) VALUES (?, ?)', [name, season]);
          tid = ins.insertId;
          insertedTransporters++;
        }
        transporterIdByKey.set(key, tid);
        seenKeys.add(key);
      }

      if (!tid) continue;
      await conn.query(
        'INSERT INTO vehicles (transporter_id, vehicle_no, year, sl_no, truck_type, driver_name, driver_mobile) VALUES (?,?,?,?,?,?,?)',
        [tid, vehicleNo, year, slNo || null, truckType || null, driverName || null, driverMobile || null]
      );
      insertedVehicles++;
    }

    console.log(`Imported ${insertedTransporters} transporters, ${insertedVehicles} vehicles from ${INPUT_FILE}. Skipped ${skipped} rows missing transporter or vehicle.`);
  } catch (err) {
    console.error('Import failed', err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
