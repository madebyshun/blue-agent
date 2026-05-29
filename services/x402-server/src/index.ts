import "dotenv/config";
import express from "express";
import healthz from "./routes/healthz.js";
import ecosystemDigest from "./routes/ecosystem-digest.js";

const PORT = parseInt(process.env.PORT ?? "3002", 10);

const app = express();

app.use(express.json());

// Log every incoming request
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use(healthz);
app.use(ecosystemDigest);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`[x402-server] Listening on http://localhost:${PORT}`);
  console.log(`[x402-server] LLM: ${process.env.BANKR_API_KEY ? "enabled" : "disabled (fallback mode)"}`);
});
