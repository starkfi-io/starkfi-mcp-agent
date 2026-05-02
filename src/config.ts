export const DEFAULT_BASE_URL = "https://api.starkfi.io";

export type StarkFiConfig = {
  apiKey: string;
  baseUrl: string;
};

export function loadStarkFiConfig(): StarkFiConfig {
  const apiKey = process.env.STARKFI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "STARKFI_API_KEY is required. Export it in the shell, add it to the MCP client env block, or create a .env file in the project root (see README / npm run init).",
    );
  }
  const raw = process.env.STARKFI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const baseUrl = raw.replace(/\/+$/, "");
  return { apiKey, baseUrl };
}
