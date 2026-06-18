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
    const { full_name, email, username, password, registration_number, phone } = req.body;
    if (!full_name || !email || !username || !password || !registration_number || !phone) {
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
      'INSERT INTO users (full_name, email, username, password, role, phone_number, registration_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
      full_name,
      email,
      username,
      hashed,
      'student',
      phone,
      registration_number
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
  const db = await openDatabase();
  const role = req.session.user.role;
  const data = {};

  if (role === 'student') {
    const myReports = await db.get('SELECT COUNT(1) AS count FROM reports WHERE created_by = ?', req.session.user.id);
    const pendingClaims = await db.get('SELECT COUNT(1) AS count FROM claims WHERE user_id = ? AND status = ?', req.session.user.id, 'pending');
    const availableItems = await db.get('SELECT COUNT(1) AS count FROM reports WHERE type = ? AND status IN (?, ?) AND archived_at IS NULL', 'found', 'in security', 'claim requested');
    data.myReports = myReports.count;
    data.pendingClaims = pendingClaims.count;
    data.availableItems = availableItems.count;
  } else if (role === 'security') {
    const pendingClaims = await db.get('SELECT COUNT(1) AS count FROM claims WHERE status = ?', 'pending');
    const foundItems = await db.get('SELECT COUNT(1) AS count FROM reports WHERE type = ? AND status IN (?, ?) AND archived_at IS NULL', 'found', 'in security', 'claim requested');
    const lostReports = await db.get('SELECT COUNT(1) AS count FROM reports WHERE type = ? AND archived_at IS NULL', 'lost');
    data.pendingClaims = pendingClaims.count;
    data.foundItems = foundItems.count;
    data.lostReports = lostReports.count;
  } else if (role === 'admin') {
    const totalUsers = await db.get('SELECT COUNT(1) AS count FROM users');
    const totalReports = await db.get('SELECT COUNT(1) AS count FROM reports');
    const pendingClaims = await db.get('SELECT COUNT(1) AS count FROM claims WHERE status = ?', 'pending');
    data.totalUsers = totalUsers.count;
    data.totalReports = totalReports.count;
    data.pendingClaims = pendingClaims.count;
  }

  res.render('dashboard_landing', { role, data });
});

app.get('/student', requireRole('student'), async (req, res) => {
  const db = await openDatabase();
  const reports = await db.all('SELECT * FROM reports WHERE created_by = ? ORDER BY created_at DESC', req.session.user.id);
  res.render('dashboard_student', { reports });
});

app.get('/student/available', requireRole('student'), async (req, res) => {
  const db = await openDatabase();
  const reports = await db.all(
    `SELECT r.*, u.full_name AS reporter, u.phone_number AS reporter_phone,
      COUNT(c.id) AS claim_requests,
      SUM(CASE WHEN c.user_id = ? AND c.status = 'pending' THEN 1 ELSE 0 END) AS my_pending_claims
     FROM reports r
     LEFT JOIN users u ON u.id = r.created_by
     LEFT JOIN claims c ON c.report_id = r.id
     WHERE r.type = ? AND r.status IN (?, ?) AND r.archived_at IS NULL
     GROUP BY r.id
     ORDER BY r.created_at DESC`,
    req.session.user.id,
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
    'INSERT INTO reports (title, description, location, type, status, created_by, assigned_to, contact_phone, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
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
    'INSERT INTO reports (title, description, location, type, status, created_by, assigned_to, contact_phone, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
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
  const report = await db.get('SELECT id, status FROM reports WHERE id = ? AND type = ? AND archived_at IS NULL', id, 'found');
  if (!report || !['in security', 'claim requested'].includes(report.status)) {
    req.flash('error', 'This item cannot be claimed right now.');
    return res.redirect('/student/available');
  }

  const existing = await db.get('SELECT id FROM claims WHERE report_id = ? AND user_id = ? AND status = ?', id, req.session.user.id, 'pending');
  if (existing) {
    req.flash('error', 'You have already submitted a claim request for this item.');
    return res.redirect('/student/available');
  }

  await db.run(
    'INSERT INTO claims (report_id, user_id, status, created_at) VALUES (?, ?, ?, NOW())',
    id,
    req.session.user.id,
    'pending'
  );

  if (report.status === 'in security') {
    await db.run('UPDATE reports SET status = ? WHERE id = ?', 'claim requested', id);
  }

  req.flash('success', 'Claim request sent. Security will review it.');
  res.redirect('/student/available');
});

app.get('/security/report-found', requireRole('security'), (req, res) => res.render('security_found_report'));

app.post('/security/report-found', requireRole('security'), upload.single('image'), async (req, res) => {
  const { title, description, location, phone, owner_name } = req.body;
  const imagePath = req.file ? `uploads/${req.file.filename}` : null;
  const db = await openDatabase();
  await db.run(
    'INSERT INTO reports (title, description, location, type, status, created_by, assigned_to, contact_phone, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
    title,
    `${description} (Reported by security for owner: ${owner_name || 'Unknown'})`,
    location,
    'found',
    'in security',
    req.session.user.id,
    req.session.user.id,
    phone,
    imagePath
  );
  req.flash('success', 'Found item logged successfully at security.');
  res.redirect('/security');
});

app.post('/security/claim/:claimId/approve', requireRole('security'), async (req, res) => {
  const { claimId } = req.params;
  const db = await openDatabase();
  const claim = await db.get('SELECT * FROM claims WHERE id = ?', claimId);
  if (!claim || claim.status !== 'pending') {
    req.flash('error', 'Claim request not found or already processed.');
    return res.redirect('/security');
  }

  await db.run('UPDATE claims SET status = ?, resolved_at = NOW() WHERE id = ?', 'approved', claimId);
  await db.run('UPDATE reports SET status = ?, assigned_to = ? WHERE id = ?', 'claimed', req.session.user.id, claim.report_id);
  await db.run('UPDATE claims SET status = ?, resolved_at = NOW() WHERE report_id = ? AND id != ? AND status = ?', 'rejected', claim.report_id, claimId, 'pending');

  req.flash('success', 'Claim approved. The item is now marked claimed.');
  res.redirect('/security');
});

app.post('/security/claim/:claimId/reject', requireRole('security'), async (req, res) => {
  const { claimId } = req.params;
  const db = await openDatabase();
  const claim = await db.get('SELECT * FROM claims WHERE id = ?', claimId);
  if (!claim || claim.status !== 'pending') {
    req.flash('error', 'Claim request not found or already processed.');
    return res.redirect('/security');
  }

  await db.run('UPDATE claims SET status = ?, resolved_at = NOW() WHERE id = ?', 'rejected', claimId);
  const pending = await db.get('SELECT COUNT(1) AS count FROM claims WHERE report_id = ? AND status = ?', claim.report_id, 'pending');
  if (pending.count === 0) {
    await db.run('UPDATE reports SET status = ? WHERE id = ?', 'in security', claim.report_id);
  }

  req.flash('success', 'Claim rejected. The item remains at security.');
  res.redirect('/security');
});

app.get('/security', requireRole('security'), async (req, res) => {
  const db = await openDatabase();
  const lostReports = await db.all(
    'SELECT r.*, u.full_name AS reporter FROM reports r LEFT JOIN users u ON u.id = r.created_by WHERE r.type = ? AND r.archived_at IS NULL ORDER BY r.created_at DESC',
    'lost'
  );
  const foundReports = await db.all(
    'SELECT r.*, u.full_name AS reporter FROM reports r LEFT JOIN users u ON u.id = r.created_by WHERE r.type = ? AND r.archived_at IS NULL ORDER BY r.created_at DESC',
    'found'
  );
  const pendingClaims = await db.all(
    `SELECT c.*, r.title AS report_title, r.description AS report_description, r.location AS report_location,
      u.full_name AS claimant, u.phone_number AS claimant_phone, r.type AS report_type, r.status AS report_status
     FROM claims c
     JOIN reports r ON r.id = c.report_id
     LEFT JOIN users u ON u.id = c.user_id
     WHERE c.status = ?
     ORDER BY c.created_at DESC`,
    'pending'
  );
  res.render('dashboard_security', { lostReports, foundReports, pendingClaims });
});

app.post('/security/report/:id/assign', requireRole('security'), async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;
  const db = await openDatabase();
  await db.run('UPDATE reports SET status = ?, assigned_to = ? WHERE id = ?', status || 'in security', req.session.user.id, id);
  req.flash('success', 'Report status updated.');
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

// Admin actions: delete user, change role, reset password
app.post('/admin/user/:id/delete', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  try {
    // Prevent admin from deleting their own account
    if (req.session.user && String(req.session.user.id) === String(id)) {
      req.flash('error', 'You cannot delete your own account.');
      return res.redirect('/admin');
    }
    const db = await openDatabase();
    await db.run('DELETE FROM users WHERE id = ?', id);
    req.flash('success', 'User deleted.');
  } catch (err) {
    console.error('Error deleting user:', err);
    req.flash('error', 'Unable to delete user.');
  }
  res.redirect('/admin');
});

app.post('/admin/user/:id/role', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const valid = ['admin', 'security', 'student'];
  if (!valid.includes(role)) {
    req.flash('error', 'Invalid role.');
    return res.redirect('/admin');
  }
  try {
    const db = await openDatabase();
    await db.run('UPDATE users SET role = ? WHERE id = ?', role, id);
    req.flash('success', 'User role updated.');
  } catch (err) {
    console.error('Error updating role:', err);
    req.flash('error', 'Unable to update role.');
  }
  res.redirect('/admin');
});

app.post('/admin/user/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || password.length < 6) {
    req.flash('error', 'Password required (min 6 characters).');
    return res.redirect('/admin');
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    const db = await openDatabase();
    await db.run('UPDATE users SET password = ? WHERE id = ?', hashed, id);
    req.flash('success', 'Password reset.');
  } catch (err) {
    console.error('Error resetting password:', err);
    req.flash('error', 'Unable to reset password.');
  }
  res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Try to initialize the database, but always start the HTTP server so it
// can show a friendly error page or operate partially while DB is down.
initDatabase().catch((error) => {
  console.error('Failed to initialize database', error);
}).finally(() => {
  app.listen(PORT, () => {
    console.log(`Kabianga tracker system listening on http://localhost:${PORT}`);
  });
});
