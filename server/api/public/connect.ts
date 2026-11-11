export default defineEventHandler(async (event) => {
  try {
    const s = await import("../../../src/lib/gh-store.server");
    if (!s.storageConfigured()) {
      return { status: false, reason: "CONFIG", message: "Panel storage not configured on server" };
    }

    const { readDb } = s;
    const { db } = await readDb();

    if (db.settings.maintenance.on) {
      return { status: false, reason: "MAINTENANCE", message: db.settings.maintenance.message || "App under maintenance" };
    }

    return { status: false, reason: "NO_KEY", message: "Send user_key + serial to validate" };
  } catch (err) {
    return { status: false, reason: "SERVER_ERROR", message: String(err) };
  }
});
