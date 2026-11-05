import Fastify, { FastifyInstance } from "fastify";
import { z } from "zod";
import { Database } from "./db.js";
import { NotFoundError, SurveillanceService, ValidationError } from "./service.js";
const siteSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });
const cameraSchema = z.object({ asset_code: z.string().min(1), site_id: z.number().int().positive(), name: z.string().min(1), retention_days: z.number().int().positive().default(30) });
const checkinSchema = z.object({ online: z.boolean(), recording: z.boolean(), storage_used_pct: z.number().int().min(0).max(100), last_frame_at: z.string().nullable(), checked_at: z.string() });
export function buildApp(db: Database, apiKey: string): FastifyInstance {
  const app = Fastify({ logger: false }); const service = new SurveillanceService(db);
  app.addHook("preHandler", async (request, reply) => { if (request.url === "/health") return; if (request.headers["x-api-key"] !== apiKey) reply.code(401).send({ error: "missing or invalid API key" }); });
  const handle = (e: unknown) => { if (e instanceof NotFoundError) return { status: 404, body: { error: e.message } }; if (e instanceof ValidationError) return { status: 422, body: { error: e.message } }; if (e instanceof z.ZodError) return { status: 422, body: { error: e.issues } }; return { status: 422, body: { error: e instanceof Error ? e.message : "invalid request" } }; };
  app.get("/health", async () => ({ status: "ok" }));
  app.post("/sites", async (request, reply) => { try { const b = siteSchema.parse(request.body); return reply.code(201).send(await service.createSite(b.code, b.name)); } catch (e) { const r = handle(e); return reply.code(r.status).send(r.body); } });
  app.post("/cameras", async (request, reply) => { try { const b = cameraSchema.parse(request.body); return reply.code(201).send(await service.createCamera(b.asset_code, b.site_id, b.name, b.retention_days)); } catch (e) { const r = handle(e); return reply.code(r.status).send(r.body); } });
  app.post("/cameras/:id/checkin", async (request, reply) => { try { const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id); const b = checkinSchema.parse(request.body); return await service.checkin(id, b.online, b.recording, b.storage_used_pct, b.last_frame_at, b.checked_at); } catch (e) { const r = handle(e); return reply.code(r.status).send(r.body); } });
  app.get("/sites/:id/summary", async (request, reply) => { try { const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id); return await service.summary(id); } catch (e) { const r = handle(e); return reply.code(r.status).send(r.body); } });
  app.get("/alerts", async (request, reply) => { try { const q = z.object({ site_id: z.coerce.number().int().positive().optional() }).parse(request.query); return { alerts: await service.openAlerts(q.site_id) }; } catch (e) { const r = handle(e); return reply.code(r.status).send(r.body); } });
  app.get("/cameras/:id/activities", async (request, reply) => { try { const id = z.coerce.number().int().positive().parse((request.params as { id: string }).id); return { activities: await service.activities(id) }; } catch (e) { const r = handle(e); return reply.code(r.status).send(r.body); } });
  return app;
}
