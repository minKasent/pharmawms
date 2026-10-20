import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-white">
          <p className="text-3xl font-semibold tracking-tight">PharmaWMS</p>
          <p className="mt-2 text-sm text-brand-100">Quản lý kho thuốc · FEFO · Dự báo nhu cầu bằng AI</p>
        </div>
        <section aria-labelledby="login-heading" className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h1 id="login-heading" className="text-lg font-semibold text-slate-900">
            Đăng nhập hệ thống
          </h1>
          <Suspense fallback={null}>
            {searchParams.then(({ next }) => (
              <LoginForm returnTo={typeof next === "string" ? next : undefined} />
            ))}
          </Suspense>
        </section>
      </div>
    </main>
  );
}
