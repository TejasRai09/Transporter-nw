import 'dotenv/config';
import mysql from 'mysql2/promise';

// Seed periodic evaluation data for every vehicle.
// Creates evaluations on the 15th and the last day of each month in the given date range.
// Also ensures a single baseline per vehicle per season exists.
//
// Usage:
//   node seed-periodic-evals.js --from 2024-01-01 --to 2025-12-31 --confirm
// Optional:
//   --reset         Delete existing evaluations in the date range for the affected seasons first
//   --limit 50      Limit number of vehicles
//
// Notes:
// - "Season" mapping here is calendar-year based: 2024 => SS24-25, 2025 => SS25-26, etc.
// - Evaluations get created_at at 12:00:00 local time to avoid timezone surprises.

const argValue = (name) => {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
};
const hasArg = (name) => process.argv.includes(name);

const FROM = process.env.SEED_FROM || argValue('--from') || '2024-01-01';
const TO = process.env.SEED_TO || argValue('--to') || '2025-12-31';
const CONFIRM = hasArg('--confirm');
const RESET = hasArg('--reset');
const LIMIT = Number(process.env.SEED_LIMIT || argValue('--limit') || 0);

if (!CONFIRM) {
  console.error('Refusing to run without --confirm. Example: node seed-periodic-evals.js --from 2024-01-01 --to 2025-12-31 --confirm');
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

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const buildPayload = (bucket) => {
  // Mirrors Studio EVAL_CONFIG option values.
  const excellent = {
    gps: pick([5, 5, 3]),
    rto: pick([10, 10, 5]),
    punct: pick([10, 10, 8]),
    mech: 3,
    brk: pick([5, 5, 3]),
    load: pick([5, 5, 2]),
    idle: pick([5, 5, 2]),
    acc: 15,
    safety_tyre: 2,
    safety_brake: 5,
    safety_light: 3,
    safety_alc: 2.5,
    safety_lic: 2.5,
    resp: pick([5, 5, 0]),
    misc: pick([5, 5, 0]),
    emerg: 5,
  };

  const good = {
    gps: pick([5, 3, 3]),
    rto: pick([10, 5]),
    punct: pick([10, 8]),
    mech: pick([3, 0]),
    brk: pick([5, 3]),
    load: pick([5, 2]),
    idle: pick([5, 2]),
    acc: 15,
    safety_tyre: pick([2, 0]),
    safety_brake: pick([5, 5, 0]),
    safety_light: pick([3, 3, 0]),
    safety_alc: pick([2.5, 0]),
    safety_lic: pick([2.5, 0]),
    resp: pick([5, 0]),
    misc: pick([5, 0]),
    emerg: pick([5, 0]),
  };

  const moderate = {
    gps: pick([3, 0]),
    rto: pick([5, 0]),
    punct: pick([8, 2]),
    mech: pick([3, 0]),
    brk: pick([3, 0]),
    load: pick([2, 0]),
    idle: pick([2, 0]),
    acc: pick([15, -5]),
    safety_tyre: pick([2, 0]),
    safety_brake: pick([5, 0]),
    safety_light: pick([3, 0]),
    safety_alc: pick([2.5, 0]),
    safety_lic: pick([2.5, 0]),
    resp: pick([5, 0, -5]),
    misc: pick([5, 0, -5]),
    emerg: pick([5, 0]),
  };

  const poor = {
    gps: 0,
    rto: pick([0, 5]),
    punct: 2,
    mech: 0,
    brk: pick([0, 3]),
    load: pick([0, 2]),
    idle: pick([0, 2]),
    acc: pick([-5, -10]),
    safety_tyre: 0,
    safety_brake: 0,
    safety_light: 0,
    safety_alc: 0,
    safety_lic: 0,
    resp: pick([0, -5]),
    misc: pick([0, -5]),
    emerg: 0,
  };

  const atRisk = {
    gps: 0,
    rto: 0,
    punct: pick([2, 0]),
    mech: 0,
    brk: 0,
    load: 0,
    idle: 0,
    acc: pick([-10, 'DQ']),
    safety_tyre: 0,
    safety_brake: 0,
    safety_light: 0,
    safety_alc: 0,
    safety_lic: 0,
    resp: pick([0, -5]),
    misc: pick([0, -5]),
    emerg: 0,
  };

  switch (bucket) {
    case 'EXCELLENT':
      return excellent;
    case 'GOOD':
      return good;
    case 'MODERATE':
      return moderate;
    case 'POOR':
      return poor;
    default:
      return atRisk;
  }
};

const bucketWeights = [
  { label: 'EXCELLENT', weight: 0.2 },
  { label: 'GOOD', weight: 0.3 },
  { label: 'MODERATE', weight: 0.25 },
  { label: 'POOR', weight: 0.15 },
  { label: 'AT_RISK', weight: 0.1 },
];

const pickBucket = () => {
  const r = Math.random();
  let acc = 0;
  for (const b of bucketWeights) {
    acc += b.weight;
    if (r <= acc) return b.label;
  }
  return bucketWeights[bucketWeights.length - 1].label;
};

const scorePayload = (payload) =>
  Object.values(payload).reduce((sum, v) => (typeof v === 'number' ? sum + v : sum), 0);

const rankLabel = (score, dq) => {
  if (dq) return 'DISQUALIFIED';
  if (score >= 85) return 'EXEMPLARY';
  if (score >= 70) return 'STANDARD';
  return 'NEEDS IMPROVEMENT';
};

const parseDate = (s) => {
  // Expect YYYY-MM-DD
  const [y, m, d] = s.split('-').map((x) => Number(x));
  return new Date(y, m - 1, d);
};

const formatDateTimeLocal = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 12:00:00`;
};

const monthEndDay = (y, m0) => new Date(y, m0 + 1, 0).getDate();

const seasonForDate = (d) => {
  const y = d.getFullYear();
  const yy = String(y).slice(-2);
  const yy2 = String(y + 1).slice(-2);
  return `SS${yy}-${yy2}`;
};

const periodDates = (from, to) => {
  const dates = [];
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  for (let y = start.getFullYear(), m = start.getMonth(); y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth()); ) {
    const last = monthEndDay(y, m);
    const d15 = new Date(y, m, 15);
    const dLast = new Date(y, m, last);

    if (d15 >= from && d15 <= to) dates.push(d15);
    if (dLast >= from && dLast <= to) dates.push(dLast);

    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  // Sort just in case
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates;
};

async function main() {
  const from = parseDate(FROM);
  const to = parseDate(TO);
  if (!(from instanceof Date) || Number.isNaN(from.getTime())) throw new Error(`Invalid --from: ${FROM}`);
  if (!(to instanceof Date) || Number.isNaN(to.getTime())) throw new Error(`Invalid --to: ${TO}`);
  if (from > to) throw new Error('--from must be <= --to');

  const dates = periodDates(from, to);
  const seasons = Array.from(new Set(dates.map(seasonForDate)));

  const conn = await pool.getConnection();
  try {
    const [vehicleRows] = await conn.query(
      `SELECT id FROM vehicles ${LIMIT > 0 ? 'ORDER BY id LIMIT ?' : 'ORDER BY id'}`,
      LIMIT > 0 ? [LIMIT] : []
    );

    const vehicles = vehicleRows || [];
    if (!vehicles.length) {
      console.log('No vehicles found. Nothing to seed.');
      return;
    }

    console.log(`Seeding ${vehicles.length} vehicles, ${dates.length} periods (${seasons.join(', ')}), range ${FROM}..${TO}`);

    if (RESET) {
      // Delete existing evals in this date range for the seasons we will seed.
      const placeholders = seasons.map(() => '?').join(',');
      const fromDt = `${FROM} 00:00:00`;
      const toDt = `${TO} 23:59:59`;
      const [delRes] = await conn.query(
        `DELETE FROM evaluations WHERE created_at >= ? AND created_at <= ? AND season IN (${placeholders})`,
        [fromDt, toDt, ...seasons]
      );
      console.log(`Deleted ${delRes.affectedRows || 0} existing evaluations (RESET enabled).`);
    }

    await conn.beginTransaction();

    // Ensure baselines exist per vehicle+season
    let baselinesInserted = 0;
    for (const { id: vehicleId } of vehicles) {
      for (const season of seasons) {
        const [[exists]] = await conn.query('SELECT id FROM baselines WHERE vehicle_id = ? AND season = ? LIMIT 1', [vehicleId, season]);
        if (exists) continue;

        const docScore = pick([10, 10, 0]);
        const ageScore = pick([2, 2, 1, 0]);
        // Put baseline early in the season so it is always "available".
        const baselineYear = Number(`20${season.slice(2, 4)}`);
        const baselineCreated = `${baselineYear}-01-01 09:00:00`;
        await conn.query(
          'INSERT INTO baselines (vehicle_id, season, doc_score, age_score, created_at) VALUES (?,?,?,?,?)',
          [vehicleId, season, docScore, ageScore, baselineCreated]
        );
        baselinesInserted++;
      }
    }

    // Insert evaluations
    let evalsInserted = 0;
    const evalSql = 'INSERT INTO evaluations (vehicle_id, season, score, rank_label, dq, payload, created_at) VALUES (?,?,?,?,?,?,?)';

    for (const d of dates) {
      const createdAt = formatDateTimeLocal(d);
      const season = seasonForDate(d);

      for (const { id: vehicleId } of vehicles) {
        const [[base]] = await conn.query(
          'SELECT doc_score, age_score FROM baselines WHERE vehicle_id = ? AND season = ? ORDER BY created_at DESC LIMIT 1',
          [vehicleId, season]
        );
        const baseRow = base || { doc_score: 0, age_score: 0 };

        const bucket = pickBucket();
        const payload = buildPayload(bucket);
        const dqFlag = Object.values(payload).some((v) => v === 'DQ');

        const rawScore = (baseRow.doc_score || 0) + (baseRow.age_score || 0) + scorePayload(payload);
        const finalScore = dqFlag ? Math.max(0, rawScore - 15) : Math.max(0, Math.min(100, rawScore));
        const rank = rankLabel(finalScore, dqFlag);

        await conn.query(evalSql, [vehicleId, season, finalScore, rank, dqFlag ? 1 : 0, JSON.stringify(payload), createdAt]);
        evalsInserted++;
      }
    }

    await conn.commit();

    console.log(`Done. Inserted ${baselinesInserted} baselines and ${evalsInserted} evaluations.`);
    if (!RESET) console.log('Tip: re-run with --reset if you want to regenerate the same range without duplicates.');
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Periodic seeding failed:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
