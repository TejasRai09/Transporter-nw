const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'cane.db'));
const season = 'SS25-26';
const targetCount = 333; // requested evaluations to seed

// Helper utilities
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const payloadScore = (payload) =>
  Object.values(payload).reduce((sum, v) => (typeof v === 'number' ? sum + v : sum), 0);

// Build a payload with realistic option values per category
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
    case 'AT RISK':
    default:
      return atRisk;
  }
};

// Planned distribution across 333 rows
const initialPlan = [
  { label: 'EXCELLENT', count: 70 },
  { label: 'GOOD', count: 90 },
  { label: 'MODERATE', count: 90 },
  { label: 'POOR', count: 50 },
  { label: 'AT RISK', count: 33 },
];

const clampPlan = (plan, total) => {
  let remaining = total;
  const adjusted = plan.map((p, idx) => {
    const take = Math.max(0, Math.min(p.count, remaining));
    remaining -= take;
    return { ...p, count: take };
  });
  if (remaining > 0) adjusted[adjusted.length - 1].count += remaining;
  return adjusted;
};

db.serialize(() => {
  db.all('SELECT id FROM vehicles ORDER BY id LIMIT ?', [targetCount], (err, rows) => {
    if (err) {
      console.error('Failed to read vehicles', err);
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      console.log('No vehicles found; nothing to seed');
      process.exit(0);
    }

    const total = Math.min(targetCount, rows.length);
    const plan = clampPlan(initialPlan, total);

    const stmt = db.prepare(
      'INSERT INTO evaluations (vehicle_id, season, score, rank, dq, payload) VALUES (?,?,?,?,?,?)'
    );

    let inserted = 0;
    let vehicleIdx = 0;

    for (const bucket of plan) {
      for (let i = 0; i < bucket.count && vehicleIdx < total; i++) {
        const vehicleId = rows[vehicleIdx].id;
        const payload = buildPayload(bucket.label);
        const dqFlag = payload.acc === 'DQ' ? 1 : 0;
        const score = dqFlag ? 0 : Math.max(0, Math.min(100, payloadScore(payload)));
        stmt.run(vehicleId, season, score, dqFlag ? 'DQ' : bucket.label, dqFlag, JSON.stringify(payload));
        vehicleIdx++;
        inserted++;
      }
    }

    stmt.finalize(() => {
      console.log(`Seeded ${inserted} evaluations for season ${season}`);
      db.close();
    });
  });
});
