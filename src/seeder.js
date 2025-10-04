import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import User from './models/user.model.js'; // adjust path if needed

// --- DATABASE URI ---
const MONGO_AUTH_DB =
  'mongodb+srv://stranger:YXoSdqIhJNVW08Ql@cluster0.g1bec4e.mongodb.net/hms-auth?retryWrites=true&w=majority';

// --- ROLES ---
const roles = ['admin', 'superadmin', 'doctor', 'nurse', 'receptionist'];

// --- BCRYPT CONFIG ---
const SALT_ROUNDS = 10;

const seedRoles = async () => {
  let conn;

  try {
    conn = await mongoose.createConnection(MONGO_AUTH_DB, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const UserModel = conn.model('User', User.schema);

    console.log('✅ Connected to Auth DB');

    // Clear existing users
    await UserModel.deleteMany({});
    console.log('🧹 Existing users cleared');

    // Hash passwords for all roles
    const usersToCreate = [];
    for (const role of roles) {
      const hashedPassword = await bcryptjs.hash(`${role}123`, SALT_ROUNDS);

      usersToCreate.push({
        firstname: role.charAt(0).toUpperCase() + role.slice(1),
        lastname: 'User',
        email: `${role}@example.com`,
        password: hashedPassword, // hashed password
        role,
        gender: 'male', // default
        isVerified: true,
        registrationCompleted: new Date(),
      });
    }

    const createdUsers = await UserModel.insertMany(usersToCreate);
    console.log(`👍 ${createdUsers.length} users created:`);

    createdUsers.forEach(u => console.log(`   - ${u.email} (${u.role})`));
  } catch (err) {
    console.error('❌ Seeder error:', err);
  } finally {
    if (conn) await conn.close();
  }
};

// Run the seeder
seedRoles();
