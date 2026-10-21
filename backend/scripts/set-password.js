import 'dotenv/config';
import crypto from 'node:crypto';
import { client, databasePromise } from '../server/db.js';

const role = process.argv[2];
const email = process.argv[3]?.trim().toLowerCase();
const roles = ['student', 'trainer', 'coordinator', 'admin'];

function readSecret(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered without echo.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(`${label}: `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    function onData(character) {
      if (character === '\u0003') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        reject(new Error('Password setup cancelled.'));
      } else if (character === '\r' || character === '\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(value);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    }
    process.stdin.on('data', onData);
  });
}

let database;
try {
  if (!roles.includes(role)) throw new Error(`Choose a role: ${roles.join(', ')}.`);
  database = await databasePromise;
  const users = database.collection('users');
  const user = await users.findOne({ role, ...(email ? { email } : {}) }, { projection: { _id: 1, email: 1 } });
  if (!user) throw new Error(email ? `No ${role} account found for ${email}.` : `No sample user found for ${role}.`);
  const password = await readSecret(`New password for ${user.email}`);
  const confirmation = await readSecret('Confirm password');
  if (password.length < 12) throw new Error('Use at least 12 characters.');
  if (password !== confirmation) throw new Error('The passwords did not match.');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  await users.updateOne({ _id: user._id }, { $set: { password_hash: `scrypt$${salt}$${hash}` } });
  console.log(`Password saved as a salted scrypt hash for ${user.email}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
