import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mysql from 'mysql2/promise';

// MySQL connection pool using provided credentials (env overrides allowed)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'server1',
  database: process.env.DB_NAME || 'transpoters',
  waitForConnections: true,
  connectionLimit: 10,
});

// Small helpers
const query = (sql, params = []) => pool.query(sql, params);
const getOne = async (sql, params = []) => {
  const [rows] = await query(sql, params);
  return rows[0] || null;
};

const normalizeDateTimeFilter = (value, kind) => {
  if (!value) return value;
  const s = String(value);
  // If client sends YYYY-MM-DD, interpret as whole day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return kind === 'to' ? `${s} 23:59:59` : `${s} 00:00:00`;
  }
  return s;
};

const seasonStartYear = (season) => {
  const m = /^SS(\d{2})-(\d{2})$/.exec(String(season || ''));
  if (!m) return null;
  const yy = Number(m[1]);
  if (!Number.isFinite(yy)) return null;
  return 2000 + yy;
};

const clampDateRangeToSeason = ({ season, from, to }) => {
  const y = seasonStartYear(season);
  if (!y) return { from, to };
  const seasonFrom = `${y}-01-01`;
  const seasonTo = `${y}-12-31`;
  const requestedFrom = from || seasonFrom;
  const requestedTo = to || seasonTo;
  // Compare as Date objects (safe for YYYY-MM-DD).
  const fromDate = new Date(`${requestedFrom}T00:00:00Z`);
  const toDate = new Date(`${requestedTo}T00:00:00Z`);
  const minDate = new Date(`${seasonFrom}T00:00:00Z`);
  const maxDate = new Date(`${seasonTo}T00:00:00Z`);
  const clampedFrom = fromDate < minDate ? seasonFrom : requestedFrom;
  const clampedTo = toDate > maxDate ? seasonTo : requestedTo;
  return { from: clampedFrom, to: clampedTo };
};

const currentHalfWindowRange = () => {
  const now = new Date();
  const day = now.getDate();
  const firstHalf = day <= 15;
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = firstHalf ? `${year}-${String(month).padStart(2, '0')}-01 00:00:00` : `${year}-${String(month).padStart(2, '0')}-16 00:00:00`;
  const endDay = firstHalf ? 15 : new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')} 23:59:59`;
  return { start, end };
};

async function createSchema() {
  const ddl = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      login VARCHAR(120) NOT NULL UNIQUE,
      role ENUM('admin','auditor','viewer') NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
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
    CREATE TABLE IF NOT EXISTS baselines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id INT NOT NULL,
      season VARCHAR(32) NOT NULL,
      doc_score INT NOT NULL,
      age_score INT NOT NULL,
      fitness_expiry DATE NULL,
      insurance_expiry DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_baseline_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id INT NOT NULL,
      season VARCHAR(32) NOT NULL,
      score DECIMAL(10,2) NOT NULL,
      rank_label VARCHAR(32) NOT NULL,
      dq TINYINT(1) DEFAULT 0,
      payload TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_eval_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      evaluation_id INT NOT NULL,
      note TEXT,
      severity VARCHAR(32),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_inc_eval FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      who VARCHAR(120),
      role VARCHAR(32),
      action TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const conn = await pool.getConnection();
  try {
    for (const stmt of ddl.split(';').map((s) => s.trim()).filter(Boolean)) {
      await conn.query(stmt);
    }
    // Ensure transporter name+season is unique
    try {
      await conn.query('CREATE UNIQUE INDEX idx_transporters_name_season ON transporters(name, season)');
    } catch (e) {
      if (e.errno !== 1061) throw e; // Ignore duplicate index error
    }
    // Add fitness_expiry column if it doesn't exist
    try {
      await conn.query('ALTER TABLE baselines ADD COLUMN fitness_expiry DATE NULL');
    } catch (e) {
      if (e.errno !== 1060) throw e; // Ignore duplicate column error
    }
    // Add insurance_expiry column if it doesn't exist
    try {
      await conn.query('ALTER TABLE baselines ADD COLUMN insurance_expiry DATE NULL');
    } catch (e) {
      if (e.errno !== 1060) throw e; // Ignore duplicate column error
    }
  } finally {
    conn.release();
  }
}

async function seedDemo() {
  if (process.env.SEED_DEMO !== 'true') {
    return;
  }
  const [userRows] = await query('SELECT COUNT(1) AS c FROM users');
  const userCount = userRows[0]?.c || 0;
  if (userCount === 0) {
    await query('INSERT INTO users (name, login, role, password_hash) VALUES (?,?,?,?)', ['System Admin', 'admin', 'admin', 'Admin@2026']);
    await query('INSERT INTO users (name, login, role, password_hash) VALUES (?,?,?,?)', ['Field Auditor', 'auditor', 'auditor', 'Audit@2026']);
    await query('INSERT INTO users (name, login, role, password_hash) VALUES (?,?,?,?)', ['Read Only', 'viewer', 'viewer', 'View@2026']);
  }

  // Ensure demo accounts are consistent
  await query("UPDATE users SET role='admin', password_hash='Admin@2026' WHERE login='admin'");
  await query("UPDATE users SET role='auditor', password_hash='Audit@2026' WHERE login='auditor'");
  await query("UPDATE users SET role='viewer', password_hash='View@2026', name=COALESCE(name, 'Read Only') WHERE login='viewer'");

  const [tRows] = await query('SELECT COUNT(1) AS c FROM transporters');
  const transporterCount = tRows[0]?.c || 0;
  if (transporterCount === 0) {
    const season = 'SS25-26';
    const seedTransporters = ['Ganga Valley Transport', 'Sunrise Logistics', 'Balaji Haulers', 'Riverbed Carriers', 'Metro Cane Services'];
    const vehiclesByT = {
      'Ganga Valley Transport': ['GV-101', 'GV-102', 'GV-103'],
      'Sunrise Logistics': ['SL-201', 'SL-202'],
      'Balaji Haulers': ['BH-305', 'BH-306'],
      'Riverbed Carriers': ['RC-401'],
      'Metro Cane Services': ['MC-505', 'MC-506', 'MC-507'],
    };
    const baselineSeed = {
      'GV-101': { doc: 10, age: 2 },
      'SL-201': { doc: 10, age: 1 },
      'BH-305': { doc: 0, age: 0 },
      'RC-401': { doc: 10, age: 2 },
      'MC-505': { doc: 10, age: 2 },
    };

    for (const name of seedTransporters) {
      const [tRes] = await query('INSERT INTO transporters (name, season) VALUES (?,?)', [name, season]);
      const tId = tRes.insertId;
      for (const v of vehiclesByT[name] || []) {
        const [vRes] = await query('INSERT INTO vehicles (transporter_id, vehicle_no, year) VALUES (?,?,?)', [tId, v, null]);
        const vehId = vRes.insertId;
        if (baselineSeed[v]) {
          await query('INSERT INTO baselines (vehicle_id, season, doc_score, age_score) VALUES (?,?,?,?)', [vehId, season, baselineSeed[v].doc, baselineSeed[v].age]);
        }
      }
    }
  }
}

async function bootstrap() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('tiny'));

  await createSchema();
  await seedDemo();

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/seed', async (_req, res) => {
    const first = await getOne('SELECT * FROM users LIMIT 1');
    if (first) return res.json({ ok: true, message: 'Seed already present' });
    const password_hash = 'admin123';
    const [r] = await query('INSERT INTO users (name, login, role, password_hash) VALUES (?,?,?,?)', ['Super Admin', 'superadmin', 'superadmin', password_hash]);
    res.json({ ok: true, message: 'Seeded superadmin/superadmin', id: r.insertId });
  });

  // Users
  app.get('/users', async (_req, res) => {
    const [rows] = await query('SELECT id, name, login, role, created_at FROM users');
    res.json(rows);
  });
  app.post('/users', async (req, res) => {
    const { name, login, role, password } = req.body || {};
    if (!name || !login || !role || !password) return res.status(400).json({ error: 'name, login, role, password required' });
    try {
      const [result] = await query('INSERT INTO users (name, login, role, password_hash) VALUES (?,?,?,?)', [name, login, role, password]);
      res.json({ id: result.insertId });
    } catch (e) {
      res.status(400).json({ error: 'login must be unique' });
    }
  });
  app.put('/users/:id', async (req, res) => {
    const { name, login, role, password } = req.body || {};
    if (!name || !login || !role) return res.status(400).json({ error: 'name, login, role required' });
    await query('UPDATE users SET name=?, login=?, role=?, password_hash=COALESCE(?, password_hash) WHERE id=?', [name, login, role, password || null, req.params.id]);
    res.json({ ok: true });
  });
  app.delete('/users/:id', async (req, res) => {
    await query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // Auth
  app.post('/auth/login', async (req, res) => {
    const { login, password } = req.body || {};
    if (!login || !password) return res.status(400).json({ error: 'login and password required' });
    const user = await getOne('SELECT * FROM users WHERE login = ?', [login]);
    if (!user || user.password_hash !== password) return res.status(401).json({ error: 'invalid credentials' });
    res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
  });

  // Transporters
  app.get('/transporters', async (_req, res) => {
    const [rows] = await query('SELECT * FROM transporters');
    res.json(rows);
  });
  app.post('/transporters', async (req, res) => {
    const { name, season } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanSeason = String(season || '').trim();
    if (!cleanName || !cleanSeason) return res.status(400).json({ error: 'name and season required' });
    const existing = await getOne('SELECT id FROM transporters WHERE name = ? AND season = ? LIMIT 1', [cleanName, cleanSeason]);
    if (existing) return res.status(409).json({ error: 'transporter already exists for this season' });
    const [result] = await query('INSERT INTO transporters (name, season) VALUES (?,?)', [cleanName, cleanSeason]);
    res.json({ id: result.insertId, name: cleanName, season: cleanSeason });
  });
  app.put('/transporters/:id', async (req, res) => {
    const { name, season } = req.body || {};
    if (!name || !season) return res.status(400).json({ error: 'name and season required' });
    await query('UPDATE transporters SET name=?, season=? WHERE id=?', [name, season, req.params.id]);
    res.json({ ok: true });
  });
  app.delete('/transporters/:id', async (req, res) => {
    const id = req.params.id;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM vehicles WHERE transporter_id=?', [id]);
      await conn.query('DELETE FROM transporters WHERE id=?', [id]);
      await conn.commit();
      res.json({ ok: true });
    } catch (err) {
      await conn.rollback();
      res.status(400).json({ error: 'Unable to delete transporter' });
    } finally {
      conn.release();
    }
  });

  // Vehicles
  app.get('/vehicles', async (_req, res) => {
    const [rows] = await query('SELECT * FROM vehicles');
    res.json(rows);
  });
  app.get('/transporters/:id/vehicles', async (req, res) => {
    const [rows] = await query('SELECT * FROM vehicles WHERE transporter_id = ?', [req.params.id]);
    res.json(rows);
  });
  app.post('/transporters/:id/vehicles', async (req, res) => {
    const { vehicle_no, year, sl_no, truck_type, driver_name, driver_mobile } = req.body || {};
    if (!vehicle_no) return res.status(400).json({ error: 'vehicle_no required' });
    const [result] = await query(
      'INSERT INTO vehicles (transporter_id, vehicle_no, year, sl_no, truck_type, driver_name, driver_mobile) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, vehicle_no, year || null, sl_no || null, truck_type || null, driver_name || null, driver_mobile || null]
    );
    res.json({ id: result.insertId, vehicle_no, year, sl_no, truck_type, driver_name, driver_mobile });
  });
  app.put('/vehicles/:id', async (req, res) => {
    const { vehicle_no, sl_no, truck_type, driver_name, driver_mobile } = req.body || {};
    if (!vehicle_no) return res.status(400).json({ error: 'vehicle_no required' });
    await query(
      'UPDATE vehicles SET vehicle_no=?, sl_no=?, truck_type=?, driver_name=?, driver_mobile=? WHERE id=?',
      [vehicle_no, sl_no || null, truck_type || null, driver_name || null, driver_mobile || null, req.params.id]
    );
    res.json({ ok: true });
  });
  app.delete('/vehicles/:id', async (req, res) => {
    await query('DELETE FROM vehicles WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // Baseline
  app.get('/vehicles/:id/baseline', async (req, res) => {
    const { season } = req.query || {};
    const seasonClause = season ? 'AND season = ?' : '';
    const params = season ? [req.params.id, season] : [req.params.id];
    const [rows] = await query(`SELECT * FROM baselines WHERE vehicle_id = ? ${seasonClause} ORDER BY created_at DESC LIMIT 1`, params);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  });
  app.post('/vehicles/:id/baseline', async (req, res) => {
    const { season, doc_score, age_score, fitness_expiry, insurance_expiry } = req.body || {};
    if (season == null || doc_score == null || age_score == null) return res.status(400).json({ error: 'season, doc_score, age_score required' });
    const [result] = await query(
      'INSERT INTO baselines (vehicle_id, season, doc_score, age_score, fitness_expiry, insurance_expiry) VALUES (?,?,?,?,?,?)',
      [req.params.id, season, doc_score, age_score, fitness_expiry || null, insurance_expiry || null]
    );
    res.json({ id: result.insertId });
  });

  // Evaluations
  app.post('/vehicles/:id/evaluations', async (req, res) => {
    const { season, score, rank, dq = 0, payload = {}, incidents = [] } = req.body || {};
    if (season == null || score == null || !rank) return res.status(400).json({ error: 'season, score, rank required' });

    const { start, end } = currentHalfWindowRange();
    const [existing] = await query(
      'SELECT id FROM evaluations WHERE vehicle_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT 1',
      [req.params.id, start, end]
    );
    
    // If evaluation exists in current window, UPDATE it (also update the season)
    if (existing.length) {
      const evalId = existing[0].id;
      
      await query(
        'UPDATE evaluations SET season = ?, score = ?, rank_label = ?, dq = ?, payload = ? WHERE id = ?',
        [season, score, rank, dq ? 1 : 0, JSON.stringify(payload), evalId]
      );

      // Delete old incidents and insert new ones
      await query('DELETE FROM incidents WHERE evaluation_id = ?', [evalId]);
      for (const inc of incidents) {
        await query('INSERT INTO incidents (evaluation_id, note, severity) VALUES (?,?,?)', [evalId, inc.note || '', inc.severity || '']);
      }
      
      return res.json({ id: evalId, updated: true });
    }

    const [evalResult] = await query(
      'INSERT INTO evaluations (vehicle_id, season, score, rank_label, dq, payload) VALUES (?,?,?,?,?,?)',
      [req.params.id, season, score, rank, dq ? 1 : 0, JSON.stringify(payload)]
    );
    const evalId = evalResult.insertId;
    for (const inc of incidents) {
      await query('INSERT INTO incidents (evaluation_id, note, severity) VALUES (?,?,?)', [evalId, inc.note || '', inc.severity || '']);
    }
    res.json({ id: evalId, updated: false });
  });

  app.get('/vehicles/:id/evaluations', async (req, res) => {
    const { season, from, to } = req.query || {};
    const fromDt = normalizeDateTimeFilter(from, 'from');
    const toDt = normalizeDateTimeFilter(to, 'to');
    const conditions = ['vehicle_id = ?'];
    const params = [req.params.id];
    if (season) {
      conditions.push('season = ?');
      params.push(season);
    }
    if (fromDt) {
      conditions.push('created_at >= ?');
      params.push(fromDt);
    }
    if (toDt) {
      conditions.push('created_at <= ?');
      params.push(toDt);
    }
    const sql = `SELECT * FROM evaluations WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`;
    const [rows] = await query(sql, params);
    res.json(rows);
  });

  // Reports
  app.get('/reports/latest', async (req, res) => {
    const { season, from, to } = req.query || {};
    const fromDt = normalizeDateTimeFilter(from, 'from');
    const toDt = normalizeDateTimeFilter(to, 'to');
    const evalFilters = [];
    const evalParams = [];
    const baselineFilters = [];
    const baselineParams = [];
    const transporterFilters = [];
    const transporterParams = [];

    if (season) {
      evalFilters.push('e.season = ?');
      evalParams.push(season);
      baselineFilters.push('b.season = ?');
      baselineParams.push(season);
      transporterFilters.push('t.season = ?');
      transporterParams.push(season);
    }
    if (fromDt) {
      evalFilters.push('e.created_at >= ?');
      evalParams.push(fromDt);
    }
    if (toDt) {
      evalFilters.push('e.created_at <= ?');
      evalParams.push(toDt);
    }

    const evalClause = evalFilters.length ? ` AND ${evalFilters.join(' AND ')}` : '';
    const baselineClause = baselineFilters.length ? ` AND ${baselineFilters.join(' AND ')}` : '';
    const transporterClause = transporterFilters.length ? ` WHERE ${transporterFilters.join(' AND ')}` : '';

    // We reuse evaluation params for each subquery.
    // evalClause appears 5 times (score, rank, dq, date, payload).
    const params = [
      ...evalParams,
      ...evalParams,
      ...evalParams,
      ...evalParams,
      ...evalParams,
      ...baselineParams,
      ...baselineParams,
      ...transporterParams,
    ];

    const sql = `
      SELECT
        v.id AS vehicle_id,
        v.vehicle_no,
        v.truck_type,
        v.driver_name,
        v.driver_mobile,
        v.sl_no,
        t.id AS transporter_id,
        t.name AS transporter_name,
        t.season AS season,
        (SELECT e.score FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS eval_score,
        (SELECT e.rank_label FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS eval_rank,
        (SELECT e.dq FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS eval_dq,
        (SELECT e.created_at FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS eval_date,
        (SELECT CAST(e.payload AS CHAR) FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS eval_payload,
        (SELECT b.doc_score FROM baselines b WHERE b.vehicle_id = v.id${baselineClause} ORDER BY b.created_at DESC LIMIT 1) AS doc_score,
        (SELECT b.age_score FROM baselines b WHERE b.vehicle_id = v.id${baselineClause} ORDER BY b.created_at DESC LIMIT 1) AS age_score
      FROM vehicles v
      INNER JOIN transporters t ON t.id = v.transporter_id
      ${transporterClause}
      ORDER BY t.name, v.vehicle_no`;

    const [rows] = await query(sql, params);
    res.json(rows);
  });

  // Consolidated season summary (per vehicle)
  // - avg score across the season (and optional from/to)
  // - counts, dq count
  // - last evaluation meta (rank/date)
  app.get('/reports/summary', async (req, res) => {
    const { season, from, to } = req.query || {};
    if (!season) return res.status(400).json({ error: 'season is required' });

    const fromDt = normalizeDateTimeFilter(from, 'from');
    const toDt = normalizeDateTimeFilter(to, 'to');

    const evalFilters = ['e.season = ?'];
    const evalParams = [season];
    const baselineFilters = ['b.season = ?'];
    const baselineParams = [season];

    if (fromDt) {
      evalFilters.push('e.created_at >= ?');
      evalParams.push(fromDt);
    }
    if (toDt) {
      evalFilters.push('e.created_at <= ?');
      evalParams.push(toDt);
    }

    const evalClause = ` AND ${evalFilters.join(' AND ')}`;
    const baselineClause = ` AND ${baselineFilters.join(' AND ')}`;

    // evalClause appears 5 times below.
    const params = [
      ...evalParams, // avg
      ...evalParams, // count
      ...evalParams, // dq_count
      ...evalParams, // last_rank
      ...evalParams, // last_date
      ...evalParams, // last_dq
      ...baselineParams, // doc
      ...baselineParams, // age
    ];

    const sql = `
      SELECT
        v.id AS vehicle_id,
        v.vehicle_no,
        v.truck_type,
        v.driver_name,
        v.driver_mobile,
        v.sl_no,
        t.id AS transporter_id,
        t.name AS transporter_name,
        ? AS season,
        (SELECT AVG(e.score) FROM evaluations e WHERE e.vehicle_id = v.id${evalClause}) AS eval_avg_score,
        (SELECT COUNT(e.id) FROM evaluations e WHERE e.vehicle_id = v.id${evalClause}) AS eval_count,
        (SELECT COALESCE(SUM(e.dq), 0) FROM evaluations e WHERE e.vehicle_id = v.id${evalClause}) AS dq_count,
        (SELECT e.rank_label FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS last_eval_rank,
        (SELECT e.created_at FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS last_eval_date,
        (SELECT e.dq FROM evaluations e WHERE e.vehicle_id = v.id${evalClause} ORDER BY e.created_at DESC LIMIT 1) AS last_eval_dq,
        (SELECT b.doc_score FROM baselines b WHERE b.vehicle_id = v.id${baselineClause} ORDER BY b.created_at DESC LIMIT 1) AS doc_score,
        (SELECT b.age_score FROM baselines b WHERE b.vehicle_id = v.id${baselineClause} ORDER BY b.created_at DESC LIMIT 1) AS age_score
      FROM vehicles v
      INNER JOIN transporters t ON t.id = v.transporter_id
      WHERE t.season = ?
      ORDER BY t.name, v.vehicle_no`;

    // Note: the first param is the selected season (for the "season" column), then the repeated eval/baseline params, then the transporter season filter.
    const [rows] = await query(sql, [season, ...params, season]);
    res.json(rows);
  });

  // Viewer-focused windowed summary:
  // Computes average score across a date range, but only using the latest evaluation
  // within each 15-day (half-month) window.
  app.get('/reports/windowed-summary', async (req, res) => {
    try {
      const { season } = req.query || {};
      if (!season) return res.status(400).json({ error: 'season is required' });

      const { from, to } = clampDateRangeToSeason({ season, from: req.query.from, to: req.query.to });
      if (from && to) {
        const fromDate = new Date(`${from}T00:00:00Z`);
        const toDate = new Date(`${to}T00:00:00Z`);
        if (Number.isFinite(fromDate.getTime()) && Number.isFinite(toDate.getTime()) && fromDate > toDate) {
          return res.status(400).json({ error: 'from must be <= to' });
        }
      }

      const fromDt = normalizeDateTimeFilter(from, 'from');
      const toDt = normalizeDateTimeFilter(to, 'to');

      const [vehicleRows] = await query(
        `
        SELECT
          v.id AS vehicle_id,
          v.vehicle_no,
          v.truck_type,
          v.driver_name,
          v.driver_mobile,
          v.sl_no,
          v.transporter_id,
          t.name AS transporter_name,
          ? AS season,
          (SELECT b.doc_score FROM baselines b WHERE b.vehicle_id = v.id AND b.season = ? ORDER BY b.created_at DESC LIMIT 1) AS doc_score,
          (SELECT b.age_score FROM baselines b WHERE b.vehicle_id = v.id AND b.season = ? ORDER BY b.created_at DESC LIMIT 1) AS age_score
        FROM vehicles v
        JOIN transporters t ON t.id = v.transporter_id
        WHERE t.season = ?
        ORDER BY t.name, v.vehicle_no
        `,
        [season, season, season, season]
      );

      const [evalRows] = await query(
        `
        SELECT
          e.vehicle_id,
          e.score,
          e.dq,
          e.rank_label,
          e.created_at,
          DATE(e.created_at) AS created_date
        FROM evaluations e
        WHERE e.season = ?
          AND (? IS NULL OR e.created_at >= ?)
          AND (? IS NULL OR e.created_at <= ?)
        ORDER BY e.vehicle_id, e.created_at
        `,
        [season, fromDt || null, fromDt || null, toDt || null, toDt || null]
      );

      const latestByVehicleWindow = new Map(); // vid -> Map(windowKey -> row)
      const lastEvalByVehicle = new Map(); // vid -> last row

      for (const r of evalRows) {
        const vid = String(r.vehicle_id);
        const dateStr = r.created_date ? String(r.created_date) : null; // YYYY-MM-DD
        if (!dateStr) continue;

        const day = Number(dateStr.slice(8, 10));
        const half = day <= 15 ? 'H1' : 'H2';
        const windowKey = `${dateStr.slice(0, 7)}-${half}`; // YYYY-MM-H1/H2

        let windowMap = latestByVehicleWindow.get(vid);
        if (!windowMap) {
          windowMap = new Map();
          latestByVehicleWindow.set(vid, windowMap);
        }

        // Rows ordered by created_at; overwriting keeps the latest in the window.
        windowMap.set(windowKey, r);
        lastEvalByVehicle.set(vid, r);
      }

      const rows = vehicleRows.map((v) => {
        const vid = String(v.vehicle_id);
        const windowMap = latestByVehicleWindow.get(vid);

        let validCount = 0;
        let dqCount = 0;
        let scoreSum = 0;

        if (windowMap) {
          for (const w of windowMap.values()) {
            const dq = Number(w.dq) === 1;
            if (dq) {
              dqCount += 1;
              continue;
            }
            const s = w.score == null ? null : Number(w.score);
            if (s == null || !Number.isFinite(s)) continue;
            validCount += 1;
            scoreSum += s;
          }
        }

        const avg = validCount > 0 ? scoreSum / validCount : null;
        const last = lastEvalByVehicle.get(vid);

        return {
          vehicle_id: v.vehicle_id,
          vehicle_no: v.vehicle_no,
          truck_type: v.truck_type,
          driver_name: v.driver_name,
          driver_mobile: v.driver_mobile,
          sl_no: v.sl_no,
          transporter_id: v.transporter_id,
          transporter_name: v.transporter_name,
          season: v.season,
          eval_avg_score: avg,
          eval_count: validCount,
          dq_count: dqCount,
          last_eval_rank: last ? last.rank_label : null,
          last_eval_dq: last ? Number(last.dq) : null,
          last_eval_date: last ? last.created_at : null,
          doc_score: v.doc_score == null ? null : Number(v.doc_score),
          age_score: v.age_score == null ? null : Number(v.age_score),
        };
      });

      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server error' });
    }
  });

  // Logs
  app.post('/logs', async (req, res) => {
    const { who, role, action } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action required' });
    const [result] = await query('INSERT INTO logs (who, role, action) VALUES (?,?,?)', [who || '', role || '', action]);
    res.json({ id: result.insertId });
  });
  app.get('/logs', async (_req, res) => {
    const [rows] = await query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`API ready on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
