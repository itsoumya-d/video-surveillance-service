import { migrate, poolDatabase } from "./db.js";
import { buildApp } from "./app.js";
const url = process.env.DATABASE_URL; const key = process.env.API_KEY;
if (!url || !key) { console.error("DATABASE_URL and API_KEY are required"); process.exit(1); }
const db = poolDatabase(url); await migrate(db);
await buildApp(db, key).listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 8000) });
