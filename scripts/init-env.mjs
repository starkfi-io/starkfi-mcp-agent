#!/usr/bin/env node
/**
 * Inicializa o ficheiro .env no projeto (STARKFI_API_KEY e opcionalmente STARKFI_BASE_URL).
 * Executar: npm run init
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = join(PROJECT_ROOT, ".env");

/** .env line value: quote if needed for special characters */
function envLine(key, value) {
  if (/[\s#'"$`\\]/.test(value)) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "");
    return `${key}="${escaped}"`;
  }
  return `${key}=${value}`;
}
const DEFAULT_BASE = "https://api.starkfi.io";

async function main() {
  const rl = createInterface({ input, output });

  try {
    output.write("\n=== StarkFi MCP — configuração do .env ===\n\n");

    if (existsSync(ENV_PATH)) {
      const answer = (await rl.question("Já existe um ficheiro .env. Sobrescrever? (s/N): "))
        .trim()
        .toLowerCase();
      if (answer !== "s" && answer !== "sim" && answer !== "y" && answer !== "yes") {
        output.write("Cancelado. O .env não foi alterado.\n");
        return;
      }
    }

    const apiKey = (await rl.question("StarkFi API key (x-api-key): ")).trim();
    if (!apiKey) {
      output.write("Erro: a API key não pode estar vazia.\n");
      process.exitCode = 1;
      return;
    }

    const baseAnswer = (
      await rl.question(`URL base da API [Enter = ${DEFAULT_BASE}]: `)
    ).trim();
    const baseUrl = (baseAnswer || DEFAULT_BASE).replace(/\/+$/, "");

    const lines = [
      "# Gerado por npm run init — não commite este ficheiro",
      envLine("STARKFI_API_KEY", apiKey),
      envLine("STARKFI_BASE_URL", baseUrl),
      "",
    ];

    await writeFile(ENV_PATH, lines.join("\n"), "utf8");
    output.write(`\nFicheiro criado: ${ENV_PATH}\n`);
    output.write("\nPara carregar as variáveis nesta shell (macOS/Linux):\n");
    output.write("  export $(grep -v '^#' .env | xargs)\n");
    output.write("\nOu use um gestor como direnv / dotenv no Cursor.\n\n");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
