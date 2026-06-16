Kabianga Lost & Found Tracker
=================================

A simple Express + SQLite lost-and-found tracker used at the University of Kabianga.

Features
- Role-based dashboards (admin, security, student)
- Report lost/found items with optional photo uploads
- Security claim workflow (submit / approve / reject)
- Seeded admin and security accounts for first-run

Quick links
- App entry: [server.js](server.js)
- Database helper: [db.js](db.js)
- Render config: [render.yaml](render.yaml)
- Views: [views/](views)

Prerequisites
- Node.js >= 16
- npm
- Git

Install & run locally
1. Install dependencies

```bash
npm install
```

2. Start the app

```bash
npm start
```

3. Open http://localhost:3000

Database initialization
- The app uses SQLite (`tracker.db`). On first run the database schema and seed users are created automatically via `require('./db').initDatabase()` called in `server.js`.

Default seeded accounts (use these after first start)
- Admin: username `admin` / password `THEFABULOUS`
- Security: username `security` / password `security@24`
- Student: username `student` / password `student@24`

Configuration
- `PORT` environment variable (default 3000)
- `render.yaml` is provided for Render deployments

Deploying to Render
1. Push the repository to GitHub.
2. In Render dashboard create a new Web Service and connect the repo.
3. Render will use `render.yaml`. Build command: `npm install`, Start command: `npm start`, and `PORT` environment variable is set to `3000`.

Notes & troubleshooting
- If you see EJS template errors, check `views/` for mixed template literal usage; templates were adjusted to use proper EJS includes.
- If `PORT 3000` is in use locally, set `PORT` to another value: `PORT=4000 npm start` on *nix, or use environment configuration on Windows.

Contributing
- Create feature branches, open PRs into `main`.

License
- MIT (add your preferred license)
