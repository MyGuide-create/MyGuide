import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

type Globals = typeof globalThis & {
  __myguideDb?: { db: Db; client: Client; ready: Promise<void> };
};

function resolveUrl(): string {
  const url = process.env.DATABASE_URL?.trim() || "file:./data/myguide.db";
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    const abs = path.isAbsolute(filePath) ? filePath : path.join(/*turbopackIgnore: true*/ process.cwd(), filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return `file:${abs}`;
  }
  return url;
}

function init() {
  const g = globalThis as Globals;
  if (g.__myguideDb) return g.__myguideDb;

  const client = createClient({
    url: resolveUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  });
  const db = drizzle(client, { schema });

  const ready = (async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const { maybeSeed } = await import("../seed");
    await maybeSeed(db);
  })();

  g.__myguideDb = { db, client, ready };
  return g.__myguideDb;
}

/** Returns the Drizzle database once migrations (and optional seeding) have run. */
export async function getDb(): Promise<Db> {
  const inst = init();
  await inst.ready;
  return inst.db;
}

export { schema };
