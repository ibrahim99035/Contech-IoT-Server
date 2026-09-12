/**
 * Admin Account Seed Script
 * Creates an admin user directly in MongoDB (bypasses registration restrictions)
 * 
 * Usage: node src/scripts/createAdminAccount.js
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Configuration from environment
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@contech.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
const ADMIN_NAME = process.env.ADMIN_NAME || 'System Administrator';

// MongoDB connection - use 127.0.0.1 for SSH tunnel compatibility
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/contech?directConnection=true';

console.log('========================================');
console.log('Admin Account Creator');
console.log('========================================');
console.log(`MongoDB: ${MONGO_URI.replace(/ConTech_MongoDB_2024!Secure/, '****')}`);
console.log(`Admin Email: ${ADMIN_EMAIL}`);
console.log('');

async function createAdminAccount() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    console.log(`\nChecking for existing admin: ${ADMIN_EMAIL}...`);
    const existingAdmin = await User.findOne({ 
      email: ADMIN_EMAIL,
      role: 'admin'
    });

    if (existingAdmin) {
      console.log('\n✅ Admin account already exists!');
      console.log('─────────────────────────────────────────────');
      console.log(`   Email:    ${existingAdmin.email}`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
      console.log(`   Role:     ${existingAdmin.role}`);
      console.log(`   Name:     ${existingAdmin.name}`);
      console.log('─────────────────────────────────────────────');
      await mongoose.connection.close();
      console.log('\n👋 Done!');
      process.exit(0);
    }

    // Hash password
    console.log('\nCreating admin account...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

    // Create admin user
    const adminUser = new User({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
      active: true,
      emailActivated: true,
    });

    await adminUser.save();

    console.log('\n✅ Admin account created successfully!');
    console.log('════════════════════════════════════════════');
    console.log('   Email:     ' + adminUser.email);
    console.log('   Password:  ' + ADMIN_PASSWORD);
    console.log('   Role:      ' + adminUser.role);
    console.log('   Name:      ' + adminUser.name);
    console.log('════════════════════════════════════════════');
    console.log('\n📍 Use these credentials for manual testing:');
    console.log('   • Login: POST /api/auth/login');
    console.log('   • AdminJS Dashboard: http://localhost:5000/admin');
    console.log('   • API Docs: http://localhost:5000/api-docs');
    
    await mongoose.connection.close();
    console.log('\n👋 Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
createAdminAccount();

