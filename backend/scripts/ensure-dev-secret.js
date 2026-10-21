import crypto from 'node:crypto';
import fs from 'node:fs';

if (process.env.NODE_ENV === 'production' || process.env.SESSION_SECRET?.trim()) process.exit(0);

const envPath = new URL('../../.env', import.meta.url);
const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const secretLine = /^\s*SESSION_SECRET\s*=\s*(.*)$/m;
const existing = current.match(secretLine)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');

if (existing) process.exit(0);

const generated = crypto.randomBytes(48).toString('base64url');
const updated = secretLine.test(current)
  ? current.replace(secretLine, `SESSION_SECRET=${generated}`)
  : `${current}${current && !current.endsWith('\n') ? '\n' : ''}SESSION_SECRET=${generated}\n`;

fs.writeFileSync(envPath, updated, { mode: 0o600 });
console.log('Generated a persistent development session secret in the ignored .env file.');
