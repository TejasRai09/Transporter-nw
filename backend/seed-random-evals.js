import 'dotenv/config';
import mysql from 'mysql2/promise';

// Randomly fill baselines and evaluations for vehicles lacking any scores.
// Usage: node seed-random-evals.js [count] [season]
// Defaults: count=333, season=SS25-26. Honors DB_* env vars.

const TARGET_COUNT = Number(process.env.SEED_COUNT || process.argv[2] || 333);
const SEASON = process.env.SEASON || process.argv[3] || 'SS25-26';

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
  { label: 'AT RISK', weight: 0.1 },
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

async function main() {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT v.id
         FROM vehicles v
         LEFT JOIN evaluations e ON e.vehicle_id = v.id
        GROUP BY v.id
       HAVING COUNT(e.id) = 0
       ORDER BY RAND()
       LIMIT ?`,
      [TARGET_COUNT]
    );

    const targets = rows.length ? rows : (await conn.query('SELECT id FROM vehicles ORDER BY RAND() LIMIT ?', [TARGET_COUNT]))[0];
    if (!targets.length) {
      console.log('No vehicles found to seed.');
      return;
    }

    let baselinesInserted = 0;
    let evalsInserted = 0;

    for (const { id } of targets) {
      const [[baselineExists]] = await conn.query('SELECT id FROM baselines WHERE vehicle_id = ? LIMIT 1', [id]);
      if (!baselineExists) {
        const docScore = pick([10, 10, 10, 0]);
        const ageScore = pick([2, 2, 1, 0]);
        await conn.query('INSERT INTO baselines (vehicle_id, season, doc_score, age_score) VALUES (?,?,?,?)', [id, SEASON, docScore, ageScore]);
        baselinesInserted++;
      }

      const bucket = pickBucket();
      const payload = buildPayload(bucket);
      const dqFlag = Object.values(payload).some((v) => v === 'DQ');
      const baseScores = await conn.query('SELECT doc_score, age_score FROM baselines WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1', [id]);
      const baseRow = baseScores[0][0] || { doc_score: 0, age_score: 0 };
      const rawScore = (baseRow.doc_score || 0) + (baseRow.age_score || 0) + scorePayload(payload);
      const finalScore = dqFlag ? Math.max(0, rawScore - 15) : Math.max(0, Math.min(100, rawScore));
      const rank = rankLabel(finalScore, dqFlag);

      await conn.query(
        'INSERT INTO evaluations (vehicle_id, season, score, rank_label, dq, payload) VALUES (?,?,?,?,?,?)',
        [id, SEASON, finalScore, rank, dqFlag ? 1 : 0, JSON.stringify(payload)]
      );
      evalsInserted++;
    }

    console.log(`Seeded ${evalsInserted} evaluations (${baselinesInserted} new baselines) for season ${SEASON}.`);
  } catch (err) {
    console.error('Seeding failed', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
