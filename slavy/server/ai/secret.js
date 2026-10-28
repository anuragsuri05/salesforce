// Encrypts secrets (AI API keys) at rest with AES-256-GCM. The key comes from SLAVY_SECRET
// or a random key generated once into data/.secret (never committed: data/ is git-ignored).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DB_PATH } from '../db.js';

let key = null;
function masterKey() {
  if (key) return key;
  if (process.env.SLAVY_SECRET) {
    key = crypto.createHash('sha256').update(process.env.SLAVY_SECRET).digest();
    return key;
  }
  const file = DB_PATH === ':memory:' ? null : path.join(path.dirname(DB_PATH), '.secret');
  if (file && fs.existsSync(file)) key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  else {
    key = crypto.randomBytes(32);
    if (file) fs.writeFileSync(file, key.toString('hex'), { mode: 0o600 });
  }
  return key;
}

export function encrypt(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(blob) {
  if (!blob) return null;
  try {
    const [, iv, tag, data] = String(blob).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
