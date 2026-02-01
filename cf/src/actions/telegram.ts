export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  FILE_BUCKET?: unknown;
}

export async function callTelegram(
  env: TelegramEnv,
  method: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function callTelegramForm(
  env: TelegramEnv,
  method: string,
  form: FormData
): Promise<Record<string, unknown>> {
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  }
  return data;
}