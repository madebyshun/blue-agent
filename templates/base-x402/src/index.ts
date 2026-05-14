import http from "node:http";
import myTool from "../x402/my-tool/index.js";

const PORT = Number(process.env.PORT ?? 3000);

const server = http.createServer(async (nodeReq, nodeRes) => {
  const url = new URL(nodeReq.url ?? "/", `http://localhost:${PORT}`);
  console.log(`[${new Date().toISOString()}] ${nodeReq.method} ${url.pathname}`);

  // Build Web API Request from Node request
  const chunks: Buffer[] = [];
  for await (const chunk of nodeReq) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();

  const req = new Request(`http://localhost:${PORT}${url.pathname}`, {
    method: nodeReq.method ?? "GET",
    headers: Object.fromEntries(
      Object.entries(nodeReq.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""])
    ),
    body: nodeReq.method !== "GET" && body ? body : undefined,
  });

  let res: Response;
  if (nodeReq.method === "POST" && url.pathname === "/api/tools/my-tool") {
    res = await myTool(req);
  } else if (url.pathname === "/health") {
    res = Response.json({ status: "ok", service: "{{PROJECT_NAME}}" });
  } else {
    res = Response.json({ error: "Not found" }, { status: 404 });
  }

  // For Bun.serve: replace the http.createServer block with:
  // const server = Bun.serve({ port: PORT, fetch(req) { ... } });
  // See: https://bun.sh/docs/api/http

  const resBody = await res.text();
  nodeRes.writeHead(res.status, Object.fromEntries(res.headers.entries()));
  nodeRes.end(resBody);
});

server.listen(PORT, () => console.log(`{{PROJECT_NAME}} x402 API listening on http://localhost:${PORT}`));
