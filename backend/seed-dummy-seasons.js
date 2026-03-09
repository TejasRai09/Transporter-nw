import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

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

const seasonRange = () => {
  const now = new Date();
  const startYear = now.getFullYear() - 1;
  const endYear = now.getFullYear() + 2;
  const seasons = [];
  for (let y = startYear; y <= endYear; y++) {
    const yy = String(y).slice(-2);
    const yy2 = String(y + 1).slice(-2);
    seasons.push(`SS${yy}-${yy2}`);
  }
  return seasons;
};

const CURRENT_SEASON = process.env.SEASON || 'SS26-27';

const TRUCK_TYPES = ['TRUCK 6 TYRE', 'TRUCK 8 TYRE', 'TRUCK 10 TYRE', 'TRUCK 12 TYRE', 'TRUCK 14 TYRE', 'TRUCK 18 TYRE'];
const NAMES = ['Alpha', 'BlueRiver', 'CaneHaul', 'Delta', 'Evergreen', 'Frontier', 'Ganga', 'HillTop', 'Indigo', 'Jetline', 'Kaveri', 'Lakshmi', 'Metro', 'NorthStar', 'Orchid', 'Prairie', 'Quartz', 'Riverbed', 'Sunrise', 'Trident'];
const PERSONS = ['Amit', 'Vikram', 'Neeraj', 'Suman', 'Kavita', 'Ravi', 'Pooja', 'Ramesh', 'Imran', 'Salman', 'Ajay', 'Deepak', 'Kiran', 'Rohit', 'Sonia'];

const rand = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const pick = (arr) => arr[rand(0, arr.length - 1)];

const dummyTransporters = (season, count) => {
  const used = new Set();
  const list = [];
  while (list.length < count) {
    const name = `${pick(NAMES)} ${pick(NAMES)} Transport ${season}`;
    if (used.has(name)) continue;
    used.add(name);
    list.push(name);
  }
  return list;
};

const dummyVehicles = (transporterName, count) => {
  const prefix = transporterName.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase() || 'TRK';
  const list = [];
  for (let i = 0; i < count; i++) {
    const suffix = `${rand(10, 99)}${String(rand(1000, 9999))}`;
    list.push({
      vehicle_no: `${prefix}-${suffix}`,
      truck_type: pick(TRUCK_TYPES),
      driver_name: pick(PERSONS),
      driver_mobile: `9${rand(100000000, 999999999)}`,
      sl_no: String(rand(1, 5000)),
    });
  }
  return list;
};

const makeRank = (score, dq) => {
  if (dq) return 'DISQUALIFIED';
  if (score >= 85) return 'EXEMPLARY';
  if (score >= 70) return 'STANDARD';
  return 'NEEDS IMPROVEMENT';
};

const randomSeasonDate = (season) => {
  const m = /^SS(\d{2})-(\d{2})$/.exec(season);
  const startYear = m ? 2000 + Number(m[1]) : new Date().getFullYear();
  const month = rand(1, 12);
  const day = rand(1, new Date(startYear, month, 0).getDate());
  const hour = rand(0, 23);
  const minute = rand(0, 59);
  const second = rand(0, 59);
  return `${startYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
};

async function run() {
  const seasons = seasonRange().filter((s) => s !== CURRENT_SEASON);
  if (!seasons.length) {
    console.log('No seasons to seed (all excluded).');
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const season of seasons) {
      const [rows] = await conn.query('SELECT id FROM transporters WHERE season = ?', [season]);
      const transporterIds = rows.map((r) => r.id);
      if (transporterIds.length) {
        const placeholders = transporterIds.map(() => '?').join(',');
        await conn.query(`DELETE FROM incidents WHERE evaluation_id IN (SELECT id FROM evaluations WHERE vehicle_id IN (SELECT id FROM vehicles WHERE transporter_id IN (${placeholders})))`, transporterIds);
        await conn.query(`DELETE FROM evaluations WHERE vehicle_id IN (SELECT id FROM vehicles WHERE transporter_id IN (${placeholders}))`, transporterIds);
        await conn.query(`DELETE FROM baselines WHERE vehicle_id IN (SELECT id FROM vehicles WHERE transporter_id IN (${placeholders}))`, transporterIds);
        await conn.query(`DELETE FROM vehicles WHERE transporter_id IN (${placeholders})`, transporterIds);
        await conn.query('DELETE FROM transporters WHERE season = ?', [season]);
      }

      const names = dummyTransporters(season, rand(12, 20));
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const [ins] = await conn.query('INSERT INTO transporters (name, season) VALUES (?, ?)', [name, season]);
        const transporterId = ins.insertId;

        const vehicles = dummyVehicles(name, rand(8, 18));
        for (const v of vehicles) {
          const [vIns] = await conn.query(
            'INSERT INTO vehicles (transporter_id, vehicle_no, year, sl_no, truck_type, driver_name, driver_mobile) VALUES (?,?,?,?,?,?,?)',
            [
              transporterId,
              v.vehicle_no,
              rand(2005, 2025),
              v.sl_no,
              v.truck_type,
              v.driver_name,
              v.driver_mobile,
            ]
          );

          const vehicleId = vIns.insertId;
          const docScore = Math.random() > 0.3 ? 10 : 0;
          const ageScore = pick([0, 1, 2]);
          await conn.query(
            'INSERT INTO baselines (vehicle_id, season, doc_score, age_score, fitness_expiry, insurance_expiry, created_at) VALUES (?,?,?,?,?,?,?)',
            [
              vehicleId,
              season,
              docScore,
              ageScore,
              null,
              null,
              randomSeasonDate(season),
            ]
          );

          const evalCount = rand(1, 4);
          for (let e = 0; e < evalCount; e++) {
            const dq = Math.random() < 0.08 ? 1 : 0;
            const score = dq ? rand(0, 60) : rand(50, 100);
            const rank = makeRank(score, dq);
            const payload = {
              gps: pick([0, 1, 3, 5]),
              rto: pick([0, 4, 6, 8, 10]),
              timely_reporting: pick([0, 8, 12, 15]),
              mech: pick([0, 2, 3]),
              brk: pick([0, 3, 5]),
              load: pick([0, 2, 5]),
              acc: pick([15, -5, -10]),
              safety_tyre: pick([0, 1, 2]),
              safety_headlight: pick([0, 2]),
              safety_fuel: pick([-2, 0, 4]),
              safety_lic: pick([0, 2.5, 5]),
              resp: pick([-5, 0, 5]),
              misc: pick([-5, 0, 3, 5]),
              emerg: pick([0, 5]),
            };
            const [eIns] = await conn.query(
              'INSERT INTO evaluations (vehicle_id, season, score, rank_label, dq, payload, created_at) VALUES (?,?,?,?,?,?,?)',
              [vehicleId, season, score, rank, dq, JSON.stringify(payload), randomSeasonDate(season)]
            );
            if (dq) {
              await conn.query(
                'INSERT INTO incidents (evaluation_id, note, severity, created_at) VALUES (?,?,?,?)',
                [eIns.insertId, 'Auto-seeded incident', 'high', randomSeasonDate(season)]
              );
            }
          }
        }
      }
    }
    await conn.commit();
    console.log(`Seeded dummy transporters/vehicles for seasons: ${seasons.join(', ')}`);
    console.log(`Current season left untouched: ${CURRENT_SEASON}`);
  } catch (err) {
    await conn.rollback();
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
