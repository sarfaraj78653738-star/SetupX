"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);
    formData.append("redirect", "false");

    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      // NextAuth returns a Set-Cookie header + redirect
      // We need to apply the cookie manually for fetch-based sign-in
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        document.cookie = setCookie;
      }
      router.push("/");
      router.refresh();
      return;
    }

    const data = await res.json().catch(() => ({}));
    setErrorMsg(data.error?.message ?? data.error ?? "Sign in failed. Check your credentials.");
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {errorMsg && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {errorMsg}
        </div>
      )}
      <div>
        <Label htmlFor="email" className="text-gray-200 text-xs">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500 text-sm"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <Label htmlFor="password" className="text-gray-200 text-xs">Password</Label>
        <div className="relative mt-1">
          <Input
            id="password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500 pr-10 text-sm"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPw(!showPw)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 mt-2"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
