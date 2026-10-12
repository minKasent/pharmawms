"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, describedBy } from "@/components/ui/field";

import { type LoginState, login } from "./actions";

const initialState: LoginState = { username: "" };

const DEMO_ACCOUNTS = [
  { username: "duocsi", role: "Dược sĩ quản lý", desc: "Duyệt kiểm kê, khoá lô, dự báo AI" },
  { username: "thukho", role: "Thủ kho", desc: "Nhập kho, xuất FEFO, đếm kiểm kê" },
  { username: "muahang", role: "Mua hàng", desc: "Nhà cung cấp, đơn mua hàng (PO)" },
  { username: "admin", role: "Quản trị", desc: "Người dùng & phân quyền" },
] as const;

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const usernameError = state.fieldErrors?.username;
  const passwordError = state.fieldErrors?.password;

  function quickLogin(username: string) {
    const form = formRef.current;
    if (!form || isPending) return;
    const userField = form.elements.namedItem("username") as HTMLInputElement | null;
    const passField = form.elements.namedItem("password") as HTMLInputElement | null;
    if (userField && passField) {
      userField.value = username;
      passField.value = "Demo@123";
      form.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-4" noValidate>
      {state.formError ? <Alert tone="danger">{state.formError}</Alert> : null}
      {returnTo ? <input type="hidden" name="next" value={returnTo} /> : null}
      <Field id="username" label="Tên đăng nhập" error={usernameError}>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.username}
          aria-invalid={usernameError ? true : undefined}
          aria-describedby={describedBy("username", usernameError)}
        />
      </Field>
      <Field id="password" label="Mật khẩu" error={passwordError}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={describedBy("password", passwordError)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>

      <div className="border-t border-slate-200 pt-4">
        <p className="mb-2.5 text-xs font-medium text-slate-500">
          Đăng nhập nhanh tài khoản Demo (1 chạm · Mật khẩu: <code className="font-mono text-slate-700">Demo@123</code>):
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.username}
              type="button"
              disabled={isPending}
              onClick={() => quickLogin(acc.username)}
              className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2 text-left transition hover:border-brand-400 hover:bg-brand-50/50 disabled:opacity-50"
            >
              <span className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-900">
                <span>{acc.role}</span>
                <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[10px] text-slate-700">
                  {acc.username}
                </code>
              </span>
              <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{acc.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
