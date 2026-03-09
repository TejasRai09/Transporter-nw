const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'cane.db'));
const season = 'SS25-26';
const payload = {
  gps: 5,
  rto: 10,
  punct: 10,
  mech: 3,
  brk: 5,
  load: 5,
  idle: 5,
  acc: 15,
  safety_tyre: 2,
  safety_brake: 5,
  safety_light: 3,
  safety_alc: 2.5,
  safety_lic: 2.5,
  resp: 5,
  misc: 5,
  emerg: 5,
};

const limit = 10;

db.serialize(() => {
  db.all('SELECT id FROM vehicles LIMIT ?', [limit], (err, rows) => {
    if (err) {
      console.error('Failed to read vehicles', err);
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      console.log('No vehicles found; nothing to seed');
      process.exit(0);
    }

    const stmt = db.prepare(
      'INSERT INTO evaluations (vehicle_id, season, score, rank, dq, payload) VALUES (?,?,?,?,?,?)'
    );

    rows.forEach((row, i) => {
      const score = 80 - i; // simple descending scores for variation
      stmt.run(row.id, season, score, 'STANDARD', 0, JSON.stringify(payload));
    });

    stmt.finalize(() => {
      console.log(`Seeded ${rows.length} evaluations for season ${season}`);
      db.close();
    });
  });
});
