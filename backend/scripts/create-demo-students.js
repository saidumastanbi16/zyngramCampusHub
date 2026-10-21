import 'dotenv/config';
import crypto from 'node:crypto';
import { client, databasePromise } from '../server/db.js';

const students = [
  'Mastan', 'Harini', 'Lokesh', 'Summi', 'Sumera', 'Hafiz', 'Azimina',
  'Karishma', 'Parveen', 'Devika', 'Rahul', 'Sneha', 'Imran', 'Pooja', 'Nikhil'
].map((name) => ({
  name,
  email: `${name.toLowerCase()}.demo@example.test`
}));

const passwordFor = () => crypto.randomBytes(12).toString('base64url');
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

let database;
try {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This demo-account script is disabled in production.');
  }

  database = await databasePromise;
  const users = database.collection('users');
  const auditLog = database.collection('audit_log');
  const admin = await users.findOne({ role: 'admin' }, { projection: { _id: 1 } });
  const credentials = [];
  const auditEntries = [];

  for (const student of students) {
    const existing = await users.findOne({ email: student.email }, { projection: { _id: 1 } });
    if (existing) {
      throw new Error(`Account already exists for ${student.email}; no accounts were created.`);
    }
  }

  const newUsers = [];
  for (const student of students) {
    const password = passwordFor();
    const person = {
      _id: `u-${crypto.randomUUID()}`,
      name: student.name,
      email: student.email,
      role: 'student',
      cohort: 'Cohort 08 · Career pathways',
      avatar: student.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      password_hash: hashPassword(password),
      created_at: new Date().toISOString()
    };
    newUsers.push(person);
    auditEntries.push({
      actor_id: admin?._id || 'system:local-demo-provisioning',
      action: 'user.create',
      entity: 'user',
      entity_id: person._id,
      created_at: person.created_at
    });
    credentials.push({ name: person.name, email: person.email, password });
  }

  await users.insertMany(newUsers);
  console.log(`Created ${credentials.length} local demo student accounts. Passwords below are shown only once:\n`);
  console.table(credentials);
  await auditLog.insertMany(auditEntries);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
