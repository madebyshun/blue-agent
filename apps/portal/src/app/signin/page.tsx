import Link from "next/link";
import type { Metadata } from "next";
import AuthCard from "../_components/AuthCard";

export const metadata: Metadata = {
  title: "Sign in · Blue Hub",
  description: "Sign in to Blue Agent. Continue with Google, GitHub, email, or connect your Base wallet.",
};

export default function SignInPage() {
  return (
    <div className="px-5 sm:px-8 py-12">
      <div className="max-w-md mx-auto">

        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-lg font-bold tracking-tight">
              BLUE<span className="text-[#4FC3F7]">HUB</span>
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA] tracking-widest">DEV</span>
          </Link>
        </div>

        <AuthCard mode="signin" />

        <p className="font-mono text-[11px] text-slate-700 text-center mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[#4FC3F7] hover:underline">Create one →</Link>
        </p>
      </div>
    </div>
  );
}
