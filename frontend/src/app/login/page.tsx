import type { Metadata } from "next";
import { Suspense } from "react";

import { BrandMark } from "@/components/ui/brand-logo";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center text-white">
          <BrandMark className="mb-3.5 size-16 drop-shadow-xl" />
          <p className="text-3xl font-bold tracking-tight">
            Pharma<span className="text-teal-300">WMS</span>
          </p>
          <p className="mt-1.5 text-sm text-brand-100">Quản lý kho thuốc GSP · FEFO · Dự báo nhu cầu bằng AI</p>
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
