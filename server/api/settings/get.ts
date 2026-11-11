import { defineEventHandler, readBody } from 'h3';
import { readDb } from '../../../src/lib/gh-store.server';

export default defineEventHandler(async () => {
  const { db } = await readDb();
  return { ok: true, settings: db.settings };
});
