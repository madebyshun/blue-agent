// /chat → redirect to /app/chat (app shell version)
import { redirect } from "next/navigation";

export default function ChatRedirectPage() {
  redirect("/app/chat");
}
