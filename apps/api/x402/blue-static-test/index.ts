export default async function handler(req: Request): Promise<Response> {
  return Response.json({ ok: true, msg: "static test works", ts: new Date().toISOString() });
}
