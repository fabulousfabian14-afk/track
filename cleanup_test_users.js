const { openDatabase } = require('./db');

async function deleteTestUsers() {
  try {
    const db = await openDatabase();
    
    // Find test users
    const testUsers = await db.all(
      `SELECT id FROM users WHERE username LIKE ? OR username LIKE ? OR username LIKE ? OR username LIKE ?`,
      '%test%',
      '%student_%',
      '%pw%',
      '%playwright%'
    );
    
    console.log(`Found ${testUsers.length} test users to delete`);
    
    for (const user of testUsers) {
      // Delete claims by this user
      await db.run('DELETE FROM claims WHERE user_id = ?', user.id);
      // Delete reports by this user
      await db.run('DELETE FROM reports WHERE created_by = ? OR assigned_to = ?', user.id, user.id);
      // Delete user
      await db.run('DELETE FROM users WHERE id = ?', user.id);
      console.log(`Deleted user ID: ${user.id}`);
    }
    
    console.log('Test users cleanup complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

deleteTestUsers();
