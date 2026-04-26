import { rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = resolve(__dirname, "test.db");

export default async function globalTeardown() {
  const pid = process.env.__E2E_API_PID;
  if (pid) {
    try {
      process.kill(Number(pid), "SIGTERM");
      await new Promise((r) => setTimeout(r, 2_000));
    } catch { /* process may already be gone */ }
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(TEST_DB + suffix, { force: true });
  }
}
