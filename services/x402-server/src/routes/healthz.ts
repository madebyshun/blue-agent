import { Router } from "express";

const router = Router();

router.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

export default router;
