/**
 * Reads `.env.local`, then `.env`, as Next does: a value in `.env.local`
 * wins. Imported first by a script, so it runs before anything that reads
 * the environment as it loads — the database client among them.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
