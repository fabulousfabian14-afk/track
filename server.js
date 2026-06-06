const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { openDatabase, initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir, limits: { fileSize: 5 * 1024 * 1024 } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: 'kabianga-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 }
}));
app.use(flash());

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.error = req.flash('error');
  res.locals.success = req.flash('success');
  next();
});

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please sign in first.');
    return res.redirect('/');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      req.flash('error', 'Access denied.');
      return res.redirect('/');
    }
    next();
  };
}

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('homepage');
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await openDatabase();
    const row = await db.get('SELECT * FROM users WHERE username = ?', username);
    if (!row) {
      req.flash('error', 'Credentials are invalid.');
      return res.redirect('/login');
    }
    const valid = await bcrypt.compare(password, row.password);
    if (!valid) {
      req.flash('error', 'Credentials are invalid.');
      return res.redirect('/login');
    }
    req.session.user = { id: row.id, username: row.username, role: row.role, full_name: row.full_name };
    req.flash('success', `Welcome back, ${row.full_name}!`);
    res.redirect('/dashboard');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Unable to sign in.');
    res.redirect('/login');
  }
});

app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  try {
    const { full_name, email, username, password, role } = req.body;
    if (!full_name || !email || !username || !password) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/register');
    }
    const db = await openDatabase();
    const existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', email, username);
    if (existing) {
      req.flash('error', 'Email or username already in use.');
      return res.redirect('/register');
    }
    const hashed = await bcrypt.hash(password, 10);
    await db.run(
      'INSERT INTO users (full_name, email, username, password, role) VALUES (?, ?, ?, ?, ?)',
      full_name,
      email,
      username,
      hashed,
      role || 'student'
    );
    req.flash('success', 'Account created successfully! Please log in.');
    res.redirect('/login');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Unable to register. Please try again.');
    res.redirect('/register');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', requireLogin, async (req, res) => {
  const role = req.session.user.role;
  if (role === 'admin') return res.redirect('/admin');
  if (role === 'security') return res.redirect('/security');
  return res.redirect('/student');
});

app.get('/student', requireRole('student'), async (req, res) => {
  const db = await openDatabase();
  const reports = await db.all('SELECT * FROM reports WHERE created_by = ? ORDER BY created_at DESC', req.session.user.id);
  res.render('dashboard_student', { reports });
});

app.get('/student/available', requireRole('student'), async (req, res) => {
  const db = await openDatabase();
  const reports = await db.all(
    'SELECT r.*, u.full_name AS reporter, u.contact_phone as reporter_phone FROM reports r LEFT JOIN users u ON u.id = r.created_by WHERE r.type = ? AND r.status IN (?, ?) AND (r.archived_at IS NULL) ORDER BY r.created_at DESC',
    'found',
    'in security',
    'claim requested'
  );
  res.render('available_items', { reports });
});

app.get('/student/report-lost', requireRole('student'), (req, res) => res.render('lost_report'));
app.get('/student/report-found', requireRole('student'), (req, res) => res.render('found_report'));

app.post('/student/report-lost', requireRole('student'), upload.single('image'), async (req, res) => {
  const { title, description, location, phone } = req.body;
  const imagePath = req.file ? `uploads/${req.file.filename}` : null;
  const db = await openDatabase();
  await db.run(
    'INSERT INTO reports (title, description, location, type, status, created_by, assigned_to, contact_phone, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))',
    title,
    description,
    location,
    'lost',
    'reported',
    req.session.user.id,
    null,
    phone,
    imagePath
  );
  req.flash('success', 'Lost item report submitted successfully.');
  res.redirect('/student');
});

app.post('/student/report-found', requireRole('student'), upload.single('image'), async (req, res) => {
  const { title, description, location, phone } = req.body;
  const imagePath = req.file ? `uploads/${req.file.filename}` : null;
  const db = await openDatabase();
  await db.run(
    'INSERT INTO reports (title, description, location, type, status, created_by, assigned_to, contact_phone, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))',
    title,
    description,
    location,
    'found',
    'reported',
    req.session.user.id,
    null,
    phone,
    imagePath
  );
  req.flash('success', 'Found item report submitted successfully.');
  res.redirect('/student');
});

app.post('/student/claim/:id', requireRole('student'), async (req, res) => {
  const { id } = req.params;
  const db = await openDatabase();
  await db.run(
    'UPDATE reports SET status = ?, claim_requested_by = ?, claim_requested_at = datetime("now") WHERE id = ? AND type = ? AND status = ?',
    'claim requested',
    req.session.user.id,
    id,
    'found',
    'in security'
  );
  req.flash('success', 'Claim request sent. Security will review it.');
  res.redirect('/student/available');
});

app.get('/security', requireRole('security'), async (req, res) => {
  const db = await openDatabase();
  const reports = await db.all(
    'SELECT r.*, u.full_name AS reporter, c.full_name AS claim_requester FROM reports r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN users c ON c.id = r.claim_requested_by ORDER BY created_at DESC'
  );
  res.render('dashboard_security', { reports });
});

app.post('/security/report/:id/assign', requireRole('security'), async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  const db = await openDatabase();
  await db.run('UPDATE reports SET status = ?, assigned_to = ? WHERE id = ?', status || 'in security', req.session.user.id, id);
  req.flash('success', 'Report status updated.');
  res.redirect('/security');
});

app.post('/security/report/:id/claim', requireRole('security'), async (req, res) => {
  const { id } = req.params;
  const db = await openDatabase();
  await db.run('UPDATE reports SET status = ? WHERE id = ?', 'claimed', id);
  req.flash('success', 'Item claim marked.');
  res.redirect('/security');
});

app.post('/security/report/:id/resolve', requireRole('security'), async (req, res) => {
  const { id } = req.params;
  const db = await openDatabase();
  await db.run('UPDATE reports SET status = ? WHERE id = ?', 'closed', id);
  req.flash('success', 'Report resolved and item closed.');
  res.redirect('/security');
});

app.get('/admin', requireRole('admin'), async (req, res) => {
  const db = await openDatabase();
  const users = await db.all('SELECT id, username, full_name, email, role, phone_number FROM users ORDER BY role, username');
  const reports = await db.all('SELECT r.*, u.full_name AS reporter FROM reports r LEFT JOIN users u ON u.id = r.created_by ORDER BY created_at DESC');
  res.render('dashboard_admin', { users, reports });
});

app.get('/admin/add-user', requireRole('admin'), (req, res) => res.render('admin_add_user'));
app.post('/admin/add-user', requireRole('admin'), async (req, res) => {
  const { full_name, email, username, password, role, phone } = req.body;
  const db = await openDatabase();
  const existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', email, username);
  if (existing) {
    req.flash('error', 'Email or username already in use.');
    return res.redirect('/admin');
  }
  const hashed = await bcrypt.hash(password, 10);
  await db.run(
    'INSERT INTO users (full_name, email, username, password, role, phone_number) VALUES (?, ?, ?, ?, ?, ?)',
    full_name,
    email,
    username,
    hashed,
    role,
    phone || null
  );
  req.flash('success', 'User account created.');
  res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Kabianga tracker system listening on http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to initialize database', error);
});
