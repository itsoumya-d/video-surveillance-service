import { readFileSync } from "node:fs";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { Database } from "../src/db.js";
const schema = readFileSync(new URL("../src/schema.sql", import.meta.url), "utf8");
function testDatabase(): Database { const mem = newDb(); mem.public.none(schema); const adapter = mem.adapters.createPg(); const pool = new adapter.Pool(); return { async query(sql, params = []) { return (await pool.query(sql, params)).rows; }, async close() { await pool.end(); } }; }

describe("video surveillance service", () => {
  let app: ReturnType<typeof buildApp>; const headers = { "x-api-key": "test-key" };
  beforeEach(() => { app = buildApp(testDatabase(), "test-key"); });
  async function setup() {
    const s = await app.inject({ method: "POST", url: "/sites", headers, payload: { code: "S1", name: "Christchurch" } });
    const c = await app.inject({ method: "POST", url: "/cameras", headers, payload: { asset_code: "CAM-1", site_id: s.json().id, name: "Entrance", retention_days: 30 } });
    return { site: s.json(), camera: c.json() };
  }
  const checkin = (cameraId: number, body: object) => app.inject({ method: "POST", url: `/cameras/${cameraId}/checkin`, headers, payload: body });
  const healthy = { online: true, recording: true, storage_used_pct: 50, last_frame_at: "2026-03-01T11:59:00Z", checked_at: "2026-03-01T12:00:00Z" };

  it("serves health without auth", async () => { expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200); });
  it("rejects missing API key", async () => { expect((await app.inject({ method: "POST", url: "/sites", payload: {} })).statusCode).toBe(401); });
  it("creates a site", async () => { expect((await setup()).site.code).toBe("S1"); });
  it("rejects duplicate site", async () => {
    await setup();
    const r = await app.inject({ method: "POST", url: "/sites", headers, payload: { code: "S1", name: "Again" } });
    expect(r.statusCode).toBe(422);
  });
  it("creates a camera", async () => { expect((await setup()).camera.asset_code).toBe("CAM-1"); });
  it("rejects duplicate camera", async () => {
    const { site } = await setup();
    const r = await app.inject({ method: "POST", url: "/cameras", headers, payload: { asset_code: "CAM-1", site_id: site.id, name: "Again" } });
    expect(r.statusCode).toBe(422);
  });
  it("accepts a healthy check-in", async () => {
    const { camera } = await setup();
    const r = await checkin(camera.id, healthy);
    expect(r.json().opened).toHaveLength(0);
  });
  it("opens an offline alert", async () => {
    const { camera } = await setup();
    const r = await checkin(camera.id, { ...healthy, online: false });
    expect(r.json().opened).toHaveLength(1);
  });
  it("opens a recording alert", async () => {
    const { camera } = await setup();
    const r = await checkin(camera.id, { ...healthy, recording: false });
    expect(r.json().opened).toHaveLength(1);
  });
  it("opens a storage alert", async () => {
    const { camera } = await setup();
    const r = await checkin(camera.id, { ...healthy, storage_used_pct: 95 });
    expect(r.json().opened).toHaveLength(1);
  });
  it("opens a stale-frame alert", async () => {
    const { camera } = await setup();
    const r = await checkin(camera.id, { ...healthy, last_frame_at: "2026-03-01T10:00:00Z" });
    expect(r.json().opened).toHaveLength(1);
  });
  it("does not duplicate an open alert", async () => {
    const { camera } = await setup();
    await checkin(camera.id, { ...healthy, online: false });
    const r = await checkin(camera.id, { ...healthy, online: false });
    expect(r.json().opened).toHaveLength(0);
  });
  it("resolves an alert on recovery", async () => {
    const { camera } = await setup();
    await checkin(camera.id, { ...healthy, online: false });
    const r = await checkin(camera.id, healthy);
    expect(r.json().resolved).toHaveLength(1);
  });
  it("summarises site health", async () => {
    const { site, camera } = await setup();
    await checkin(camera.id, { ...healthy, online: false });
    const r = await app.inject({ method: "GET", url: `/sites/${site.id}/summary`, headers });
    expect(r.json().with_open_alerts).toBe(1);
  });
  it("lists open alerts", async () => {
    const { camera } = await setup();
    await checkin(camera.id, { ...healthy, recording: false });
    const r = await app.inject({ method: "GET", url: "/alerts", headers });
    expect(r.json().alerts).toHaveLength(1);
  });
  it("records activities", async () => {
    const { camera } = await setup();
    await checkin(camera.id, healthy);
    const r = await app.inject({ method: "GET", url: `/cameras/${camera.id}/activities`, headers });
    expect(r.json().activities[0].action).toBe("checkin");
  });
  it("rejects invalid storage", async () => {
    const { camera } = await setup();
    const r = await checkin(camera.id, { ...healthy, storage_used_pct: 101 });
    expect(r.statusCode).toBe(422);
  });
  it("returns 404 for a missing camera", async () => {
    const r = await app.inject({ method: "GET", url: "/cameras/999/activities", headers });
    expect(r.statusCode).toBe(404);
  });
  it("runs the full recovery workflow", async () => {
    const { site, camera } = await setup();
    await checkin(camera.id, { ...healthy, online: false, recording: false });
    await checkin(camera.id, healthy);
    const alerts = await app.inject({ method: "GET", url: `/alerts?site_id=${site.id}`, headers });
    expect(alerts.json().alerts).toHaveLength(0);
  });
});
