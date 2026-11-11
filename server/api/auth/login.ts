import { defineEventHandler, readBody } from 'h3';
import { verifyPassword, signToken, addTx, nextId, hashPassword, findUser, toProfile } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { username, password } = body as { username: string; password: string };

  if (!username || !password) {
    return { ok: false, error: 'Username and password required' };
  }

  // Read db directly
  const fs = await import('node:fs');
  const path = await import('node:path');
  const repo = process.env.GH_DATA_REPO || 'ommadhavi0990-sketch/zerox-panel-data';
  
  // Use GitHub API to read db.json
  const https = await import('node:https');
  const token = process.env.GH_DATA_TOKEN;
  
  function ghGet(apiPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.request(
        `https://api.github.com${apiPath}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'zerox-panel-server',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, json: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, json: null, text: data });
            }
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  const res = await ghGet(`/repos/${repo}/contents/db.json`);
  if (res.status !== 200 || !res.json?.content) {
    return { ok: false, error: 'Database not available' };
  }

  const content = Buffer.from(res.json.content, 'base64').toString('utf8');
  const db = JSON.parse(content);
  const u = findUser(db, username);

  if (!u || !(await verifyPassword(password, u.password_hash))) {
    return { ok: false, error: 'Wrong username or password' };
  }
  if (u.status === 'banned') return { ok: false, error: 'This account is banned. Contact the Owner.' };
  if (u.status === 'blocked') return { ok: false, error: 'This account is blocked. Contact the Owner.' };

  // Touch last-seen
  const fs2 = await import('node:fs');
  u.last_active_at = new Date().toISOString();
  const newContent = Buffer.from(JSON.stringify(db, null, 2), 'utf8').toString('base64');

  const putRes = await new Promise<any>((resolve, reject) => {
    const req = https.request(
      `https://api.github.com/repos/${repo}/contents/db.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'zerox-panel-server',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Length': Buffer.byteLength(JSON.stringify({ message: `login: ${username}`, content: newContent, sha: res.json.sha })),
        },
      },
      (res2) => {
        let data = '';
        res2.on('data', (chunk) => (data += chunk));
        res2.on('end', () => {
          try { resolve({ status: res2.statusCode, json: JSON.parse(data) }); } catch { resolve({ status: res2.statusCode, text: data }); }
        });
      },
    );
    req.on('error', reject);
    req.write(JSON.stringify({ message: `login: ${username}`, content: newContent, sha: res.json.sha }));
    req.end();
  });

  if (putRes.status >= 400) {
    return { ok: false, error: 'Failed to update last seen' };
  }

  const tokenStr = await signToken(u.id);
  const profile = toProfile(u);

  return { ok: true, token: tokenStr, me: { userId: u.id, profile, role: u.role } };
});
