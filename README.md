Kabianga Lost & Found Tracker

A role-based Express.js lost-and-found tracking system for University of Kabianga with **persistent PostgreSQL database** for production deployments.

## Features
- Role-based dashboards (admin, security, student)
- Report lost/found items with optional photo uploads
- Security claim workflow (submit / approve / reject)
- Multi-user claim requests with approval authority
- Automatic claim rejection on approval (prevents conflicts)
- Responsive mobile-friendly UI for security dashboard
- **Persistent database**: PostgreSQL via `DATABASE_URL`

## Database Options
- **Production (Render)**: Uses PostgreSQL via `DATABASE_URL` - data persists in managed database

## Quick links
- App entry: [server.js](server.js)
- Database helper: [db.js](db.js)
- Render config: [render.yaml](render.yaml)
- Views: [views/](views)

## Prerequisites
- Node.js >= 16
- npm
- Git

## Install & run locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app

```bash
npm start
```

The app uses PostgreSQL and automatically initializes tables and seed users on first run.

### 3. Open http://localhost:3000

## Database

### Production (PostgreSQL on Render)
- Uses PostgreSQL via `DATABASE_URL`
- Data persists across deployments and restarts
- Schema and seed users created automatically on first run

The app requires `DATABASE_URL` environment variable and uses PostgreSQL.

When deployed to Render with PostgreSQL:
- Data persists across deployments and restarts
- Multiple instances can share the same database
- Automatic schema creation and user seeding on startup

## Default seeded accounts

Use these credentials after first start:
- **Admin**: username `admin` / password `THEFABULOUS`
- **Security**: username `security` / password `security@24`
- **Student**: username `student` / password `student@24`

## Configuration

Environment variables:
- `PORT` (default: 3000) - Server port
- `DATABASE_URL` - PostgreSQL connection string for production

## Deploying to Render

### Prerequisites
- GitHub repository (code pushed)
- Render account

### Deployment Steps

1. **Create PostgreSQL Database** (for persistent data):
   - Go to [render.com](https://render.com)
   - Click "New +" → "PostgreSQL"
   - Name: `kahianga-db`
   - Plan: Free
   - Note the connection string (DATABASE_URL)

2. **Create Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Name: `kahianga-tracker`
   - Environment: `Node`
   - Build: `npm install`
   - Start: `npm start`
   - Add environment variable:
     - Key: `DATABASE_URL`
     - Value: Paste the PostgreSQL connection string from step 1
   - Plan: Free

3. **Deploy**:
   - Render will automatically deploy from `render.yaml`
   - Database schema and seed users are created automatically
   - Your app will be live at `https://kahianga-tracker.onrender.com`

### Notes
- `render.yaml` includes PostgreSQL configuration
- PostgreSQL data persists indefinitely on Render
- On first deployment, tables and seed users are created automatically

## Troubleshooting

### Database connection issues
- **Locally**: Verify `DATABASE_URL` is set and points to a PostgreSQL database
- **Production**: Verify `DATABASE_URL` is set correctly in Render dashboard

### Port already in use locally
On Windows:
```powershell
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

On macOS/Linux:
```bash
lsof -i :3000
kill -9 <pid>
```

Or use a different port:
```bash
PORT=4000 npm start
```

### EJS template errors
- Check that views use consistent template literal syntax inside `include()` calls
- All dashboard templates have been updated to use proper JavaScript template literal syntax

## Architecture

### Request Flow
1. Client sends request to Express server
2. Authentication middleware checks session
3. Route handler connects to PostgreSQL database
4. Data returned and rendered via EJS templates
5. Response sent to client

### Database Abstraction
- `db.js` provides a PostgreSQL interface using `pg`
- Query parameters use `$1, $2...` for PostgreSQL
- Same API is used throughout the app

## Contributing
- Create feature branches, open PRs into `main`
- Test locally with PostgreSQL before committing

## License
- MIT

---

**Last updated**: 2026-06-17  
**Database**: PostgreSQL  
**Status**: Ready for deployment to Render with persistent PostgreSQL database
