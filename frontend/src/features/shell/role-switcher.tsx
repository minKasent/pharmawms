"use client";

import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import Users from "lucide-react/dist/esm/icons/users";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { switchDemoRole } from "@/features/auth/actions";
import { cn } from "@/lib/cn";

type DemoAccount = {
  username: "duocsi" | "thukho" | "muahang" | "admin";
  roleLabel: string;
  scopeHint: string;
  dotColor: string;
};

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    username: "duocsi",
    roleLabel: "Dược sĩ phụ trách",
    scopeHint: "Toàn quyền nghiệp vụ · Duyệt PO · Chạy AI · Kiểm kê & Hủy thuốc",
    dotColor: "bg-emerald-500",
  },
  {
    username: "thukho",
    roleLabel: "Thủ kho",
    scopeHint: "Nhập kho GSP · Xuất kho FEFO · Sơ đồ kệ · Đếm kiểm kê",
    dotColor: "bg-sky-500",
  },
  {
    username: "muahang",
    roleLabel: "Nhân viên mua hàng",
    scopeHint: "Đề xuất đặt hàng (s, S) · Đơn mua PO · Nhà cung cấp",
    dotColor: "bg-violet-500",
  },
  {
    username: "admin",
    roleLabel: "Quản trị hệ thống",
    scopeHint: "Quản lý tài khoản · Phân quyền RBAC · Khóa/Mở người dùng",
    dotColor: "bg-amber-500",
  },
];

export function RoleSwitcher({ currentUsername }: { currentUsername: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  function handleSelect(username: string) {
    if (username === currentUsername || isPending) {
      setOpen(false);
      return;
    }
    setPendingRole(username);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("username", username);
      formData.set("returnTo", pathname);
      await switchDemoRole(formData);
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isPending}
        onClick={() => setOpen((prev) => !prev)}
        title="Chuyển nhanh tài khoản phân quyền để kiểm thử / thuyết trình"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100/80 disabled:opacity-60"
      >
        <Users aria-hidden="true" className="size-3.5 text-brand-700" />
        <span className="max-sm:hidden">{isPending ? "Đang chuyển…" : "Đổi vai trò"}</span>
        <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Chọn vai trò trình diễn"
          className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="border-b border-slate-100 px-2.5 py-1.5">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Chuyển nhanh phân quyền (RBAC Demo)
            </p>
          </div>
          <div className="mt-1 space-y-1">
            {DEMO_ACCOUNTS.map((account) => {
              const active = account.username === currentUsername;
              const switchingThis = isPending && pendingRole === account.username;
              return (
                <button
                  key={account.username}
                  type="button"
                  role="menuitem"
                  disabled={isPending}
                  onClick={() => handleSelect(account.username)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    active ? "bg-brand-50/90 text-brand-900" : "hover:bg-slate-50",
                  )}
                >
                  <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", account.dotColor)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">{account.roleLabel}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[10px] font-medium",
                          active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {switchingThis ? "Đang nạp…" : active ? "Đang dùng" : account.username}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{account.scopeHint}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
