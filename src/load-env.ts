import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads `.env` into `process.env` before reading StarkFi config.
 * Order: (1) `.env` next to the installed package (repo root / node_modules/starkfi-mcp),
 * (2) if the key is still missing, `.env` in `process.cwd()`.
 * Already-set environment variables are not overwritten (dotenv default).
 */
export function loadStarkFiEnvFiles(fromImportMetaUrl: string): void {
  const distDir = dirname(fileURLToPath(fromImportMetaUrl));
  const envNextToPackage = join(distDir, "..", ".env");
  const envInCwd = join(process.cwd(), ".env");

  if (existsSync(envNextToPackage)) {
    config({ path: envNextToPackage });
  }

  if (!process.env.STARKFI_API_KEY?.trim() && existsSync(envInCwd)) {
    config({ path: envInCwd });
  }
}
