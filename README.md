# Cane Transporter Portal (Home + API)

## Stack
- Frontend: static HTML/CSS/JS (no build) in `frontend/` for the home page.
- Backend: Node.js + Express + SQLite in `backend/`.

## Quick start
1) Backend
```bash
cd backend
npm install
npm run dev   # or: npm start
```
- Health: `GET http://localhost:4000/health`
- Seed superadmin (once): `POST http://localhost:4000/seed` (creates superadmin/superadmin)

2) Frontend (home page)
- Open `frontend/index.html` in the browser (or serve statically, e.g. `npx serve frontend`).
- CTA buttons point to `../Transport Framework MVP.html` (the existing portal).
- A small badge in the bottom-right checks `http://localhost:4000/health`.

## API outline
- `POST /auth/login` — demo login (plain-text for now; replace with bcrypt/JWT for prod).
- `GET/POST /transporters` — list/create transporters.
- `GET/POST /transporters/:id/vehicles` — list/add vehicles.
- `POST /vehicles/:id/baseline` — attach baseline scores.
- `POST /vehicles/:id/evaluations` — save evaluation with incidents payload.
- `GET /vehicles/:id/evaluations` — list evaluations.
- `POST /logs`, `GET /logs` — append/list audit logs.

## Notes
- Database file stored at `backend/cane.db` (auto-created).
- Hard-coded password comparison is for demo; replace with hashed passwords and tokens before production.
- CORS is enabled for local usage; tighten origins for production.
