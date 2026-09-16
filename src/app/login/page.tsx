import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SignInForm } from "./signin-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

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
            <h2 className="text-lg font-bold text-white">Sign in</h2>
            <p className="mt-1 text-sm text-gray-400">Free account — no credit card required</p>
          </div>

          {/* Demo credentials */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/80 text-center mb-4">
            <p className="font-medium text-amber-200 mb-1">Demo account</p>
            <p>Email: <code className="rounded bg-white/10 px-1">demo@setupx.test</code></p>
            <p>Password: <code className="rounded bg-white/10 px-1">demo123</code></p>
          </div>

          <SignInForm />

          <div className="mt-5 border-t border-white/10 pt-4 text-center">
            <p className="text-xs text-gray-400">
              New here?{" "}
              <a href="/register" className="text-indigo-300 hover:underline">Create a free account</a>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}
