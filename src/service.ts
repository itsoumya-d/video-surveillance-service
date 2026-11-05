import { Database } from "./db.js";
export class NotFoundError extends Error {}
export class ValidationError extends Error {}

export class SurveillanceService {
  constructor(private readonly db: Database) {}
  private async activity(cameraId: number, action: string, actor: string, detail = "") {
    await this.db.query("INSERT INTO activities (camera_id, action, actor, detail) VALUES ($1,$2,$3,$4)", [cameraId, action, actor, detail]);
  }
  async createSite(code: string, name: string) {
    if (!code.trim() || !name.trim()) throw new ValidationError("site code and name are required");
    if ((await this.db.query("SELECT id FROM sites WHERE code=$1", [code])).length) throw new ValidationError("site code already exists");
    return (await this.db.query<{ id: number; code: string }>("INSERT INTO sites (code,name) VALUES ($1,$2) RETURNING id, code", [code, name]))[0];
  }
  async createCamera(code: string, siteId: number, name: string, retentionDays = 30) {
    if (!code.trim() || !name.trim() || !Number.isInteger(retentionDays) || retentionDays <= 0) throw new ValidationError("camera code, name and positive retention are required");
    if (!(await this.db.query("SELECT id FROM sites WHERE id=$1", [siteId])).length) throw new NotFoundError("site not found");
    if ((await this.db.query("SELECT id FROM cameras WHERE asset_code=$1", [code])).length) throw new ValidationError("camera code already exists");
    return (await this.db.query<{ id: number; asset_code: string }>("INSERT INTO cameras (asset_code,site_id,name,retention_days) VALUES ($1,$2,$3,$4) RETURNING id, asset_code", [code, siteId, name, retentionDays]))[0];
  }
  async checkin(cameraId: number, online: boolean, recording: boolean, storageUsedPct: number, lastFrameAt: string | null, checkedAt: string) {
    if (!Number.isInteger(storageUsedPct) || storageUsedPct < 0 || storageUsedPct > 100) throw new ValidationError("storage_used_pct must be 0-100");
    const camera = await this.db.query<{ id: number; site_id: number }>("SELECT id, site_id FROM cameras WHERE id=$1", [cameraId]);
    if (!camera.length) throw new NotFoundError("camera not found");
    await this.db.query("INSERT INTO checkins (camera_id,checked_at,online,recording,storage_used_pct,last_frame_at) VALUES ($1,$2,$3,$4,$5,$6)", [cameraId, checkedAt, online, recording, storageUsedPct, lastFrameAt]);
    await this.db.query("UPDATE cameras SET status=$1, last_seen_at=$2 WHERE id=$3", [online ? "online" : "offline", checkedAt, cameraId]);
    const signals: Array<{ kind: string; severity: string; failed: boolean; detail: string }> = [
      { kind: "offline", severity: "critical", failed: !online, detail: "Camera is offline" },
      { kind: "recording", severity: "critical", failed: !recording, detail: "Recording is not active" },
      { kind: "storage", severity: "warning", failed: storageUsedPct > 90, detail: `Storage at ${storageUsedPct}%` },
      { kind: "stale_frame", severity: "high", failed: lastFrameAt ? new Date(checkedAt).getTime() - new Date(lastFrameAt).getTime() > 600000 : true, detail: "No recent frame" }
    ];
    const opened: number[] = []; const resolved: number[] = [];
    for (const signal of signals) {
      const active = await this.db.query<{ id: number; status: string }>("SELECT id, status FROM alerts WHERE camera_id=$1 AND kind=$2 AND status='open'", [cameraId, signal.kind]);
      if (signal.failed) {
        if (!active.length) {
          const row = (await this.db.query<{ id: number }>("INSERT INTO alerts (camera_id,kind,severity,detail) VALUES ($1,$2,$3,$4) RETURNING id", [cameraId, signal.kind, signal.severity, signal.detail]))[0];
          opened.push(row.id);
        } else {
          await this.db.query("UPDATE alerts SET detail=$1 WHERE id=$2", [signal.detail, active[0].id]);
        }
      } else if (active.length) {
        await this.db.query("UPDATE alerts SET status='resolved', resolved_at=now() WHERE id=$1", [active[0].id]);
        resolved.push(active[0].id);
      }
    }
    await this.activity(cameraId, "checkin", "camera", `online=${online} recording=${recording}`);
    return { camera_id: cameraId, opened, resolved };
  }
  async summary(siteId: number) {
    if (!(await this.db.query("SELECT id FROM sites WHERE id=$1", [siteId])).length) throw new NotFoundError("site not found");
    const cameras = await this.db.query<{ id: number; status: string }>("SELECT id, status FROM cameras WHERE site_id=$1", [siteId]);
    const ids = cameras.map((c) => c.id);
    const alerts = ids.length ? await this.db.query<{ camera_id: number }>("SELECT camera_id FROM alerts WHERE status='open' AND camera_id = ANY($1::int[])", [ids]) : [];
    const unhealthy = new Set(alerts.map((a) => a.camera_id));
    return { site_id: siteId, cameras: cameras.length, online: cameras.filter((c) => c.status === "online").length, with_open_alerts: unhealthy.size };
  }
  async openAlerts(siteId?: number) {
    if (siteId === undefined) return this.db.query("SELECT id, camera_id, kind, severity, detail FROM alerts WHERE status='open' ORDER BY id");
    return this.db.query("SELECT a.id, a.camera_id, a.kind, a.severity, a.detail FROM alerts a JOIN cameras c ON c.id=a.camera_id WHERE a.status='open' AND c.site_id=$1 ORDER BY a.id", [siteId]);
  }
  async activities(cameraId: number) {
    if (!(await this.db.query("SELECT id FROM cameras WHERE id=$1", [cameraId])).length) throw new NotFoundError("camera not found");
    return this.db.query("SELECT action, actor, detail, at FROM activities WHERE camera_id=$1 ORDER BY id", [cameraId]);
  }
}
