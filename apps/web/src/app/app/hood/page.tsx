/**
 * /hood — moved 2026-11-12. The drift board is now /markets/drift (Base 8453
 * only, inside Markets); this URL stays so every published link resolves.
 * The arrow record at /hood/arrows is unchanged. The poller, archive, x402
 * ids (hood-live, hood-track-record) and the Telegram bot are untouched.
 */
import { redirect } from "next/navigation";

export default function HoodPage() {
  redirect("/markets/drift");
}
