import { runConsoleCommand } from "./_console";
export default async function handler(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { prompt?: string };
  return runConsoleCommand("ship", body.prompt ?? "");
}
