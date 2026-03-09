import 'dotenv/config';
import mysql from 'mysql2/promise';

// Randomize driver details (and truck type) for a subset of vehicles
const COUNT = Number(process.env.DUMMY_COUNT || process.argv[2] || 333);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'server1',
  database: process.env.DB_NAME || 'transpoters',
  waitForConnections: true,
  connectionLimit: 10,
});

const firstNames = ['Amit', 'Sunil', 'Ravi', 'Deepak', 'Vikas', 'Suresh', 'Manoj', 'Pawan', 'Rohit', 'Ajay'];
const lastNames = ['Kumar', 'Yadav', 'Singh', 'Sharma', 'Verma', 'Tiwari', 'Mishra', 'Gupta', 'Patel', 'Chaudhary'];
const truckTypes = ['TRUCK 10 TYRE', 'TRUCK 12 TYRE', 'TRUCK 14 TYRE', 'TRAILER'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomName = () => `${pick(firstNames)} ${pick(lastNames)}`;
const randomMobile = () => String(Math.floor(6000000000 + Math.random() * 3999999999));

async function main() {
  const conn = await pool.getConnection();
  try {
    const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM vehicles');
    if (total === 0) {
      console.error('No vehicles found to update. Run the XLSX import first.');
      process.exit(1);
    }

    const [rows] = await conn.query('SELECT id FROM vehicles ORDER BY RAND() LIMIT ?', [COUNT]);
    let updated = 0;
    for (const { id } of rows) {
      const driverName = randomName();
      const driverMobile = randomMobile();
      const truckType = pick(truckTypes);
      await conn.query(
        'UPDATE vehicles SET driver_name = ?, driver_mobile = ?, truck_type = ? WHERE id = ?',
        [driverName, driverMobile, truckType, id]
      );
      updated++;
    }

    console.log(`Updated ${updated} vehicles with dummy driver info (requested ${COUNT}).`);
  } catch (err) {
    console.error('Seeding failed', err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
