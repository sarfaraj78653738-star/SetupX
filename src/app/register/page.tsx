"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("password", password);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Registration failed. Try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);

      // Auto-sign-in after registration
      setTimeout(() => {
        const formData2 = new FormData();
        formData2.append("email", email);
        formData2.append("password", password);
        formData2.append("redirect", "false");
        fetch("/api/auth/callback/credentials", {
          method: "POST",
          body: formData2,
        }).then((r) => {
          if (r.ok) {
            const setCookie = r.headers.get("set-cookie");
            if (setCookie) document.cookie = setCookie;
            window.location.href = "/";
          }
        });
      }, 500);
    } catch {
      setErrorMsg("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0b1020] px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <img src="/logo.png" alt="SetupX" width={44} height={44} className="rounded-xl" />
          <div>
            <h1 className="text-xl font-bold text-white">SetupX</h1>
            <p className="text-xs text-gray-400">Indian Stock Screener</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0d1428]/90 p-6 backdrop-blur">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-white">Create a free account</h2>
            <p className="mt-1 text-sm text-gray-400">
              Sign up — no credit card required
            </p>
          </div>

          {success ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="rounded-full bg-emerald-500/20 p-3 text-emerald-300">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-white font-semibold">Account created!</h3>
              <p className="mt-1 text-sm text-gray-400">Signing you in...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {errorMsg && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {errorMsg}
                </div>
              )}
              <div>
                <Label htmlFor="name" className="text-gray-200 text-xs">Name (optional)</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500 text-sm"
                  autoComplete="name"
                />
              </div>
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
                    placeholder="At least 8 characters"
                    className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-gray-500 pr-10 text-sm"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">At least 8 characters</p>
              </div>
              <Button
                type="submit"
                disabled={loading || !email || !password || password.length < 8}
                className="w-full bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          )}

          <div className="mt-5 border-t border-white/10 pt-4 text-center">
            <p className="text-xs text-gray-400">
              Already have an account?{" "}
              <Link href="/login" className="text-indigo-300 hover:underline">Sign in</Link>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          By registering, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
