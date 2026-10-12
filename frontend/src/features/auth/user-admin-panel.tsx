"use client";

import { useMutation } from "@tanstack/react-query";
import KeyRound from "lucide-react/dist/esm/icons/key-round";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import Plus from "lucide-react/dist/esm/icons/plus";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/api-error";
import { apiCommand, apiRequest } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";

import { ROLES, type Role, type User, roleLabel, userSchema } from "./user";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const COLUMN_COUNT = 5;

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Tên đăng nhập tối thiểu 3 ký tự")
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, "Chỉ gồm chữ, số và . _ -"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`).max(MAX_PASSWORD_LENGTH),
  fullName: z.string().trim().min(1, "Nhập họ tên").max(100, "Họ tên tối đa 100 ký tự"),
  role: z.enum(ROLES),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(1, "Nhập họ tên").max(100, "Họ tên tối đa 100 ký tự"),
  role: z.enum(ROLES),
  enabled: z.boolean(),
});

const passwordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`).max(MAX_PASSWORD_LENGTH),
});

type Mode = { kind: "create" } | { kind: "edit"; user: User } | { kind: "password"; user: User };

export function UserAdminPanel({ users }: { users: User[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("STOREKEEPER");
  const [enabled, setEnabled] = useState(true);
  const [validationError, setValidationError] = useState<string>();
  const formId = useId();

  const save = useMutation({
    mutationFn: async () => {
      if (!mode) throw new Error("no mode");
      if (mode.kind === "create") {
        const parsed = createSchema.safeParse({ username, password, fullName, role });
        if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "invalid"), { client: true });
        return apiRequest("/users", userSchema, { method: "POST", body: parsed.data });
      }
      if (mode.kind === "edit") {
        const parsed = updateSchema.safeParse({ fullName, role, enabled });
        if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "invalid"), { client: true });
        return apiRequest(`/users/${mode.user.id}`, userSchema, { method: "PUT", body: parsed.data });
      }
      const parsed = passwordSchema.safeParse({ newPassword: password });
      if (!parsed.success) throw Object.assign(new Error(parsed.error.issues[0]?.message ?? "invalid"), { client: true });
      await apiCommand(`/users/${mode.user.id}/password`, { body: parsed.data });
      return null;
    },
    onSuccess: () => {
      setMode(null);
      router.refresh();
    },
  });

  function openCreate() {
    setUsername("");
    setPassword("");
    setFullName("");
    setRole("STOREKEEPER");
    setEnabled(true);
    setValidationError(undefined);
    save.reset();
    setMode({ kind: "create" });
  }

  function openEdit(user: User) {
    setFullName(user.fullName);
    setRole(user.role);
    setEnabled(user.enabled);
    setValidationError(undefined);
    save.reset();
    setMode({ kind: "edit", user });
  }

  function openPassword(user: User) {
    setPassword("");
    setValidationError(undefined);
    save.reset();
    setMode({ kind: "password", user });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(undefined);
    save.mutate(undefined, {
      onError: (error) => {
        if (error && typeof error === "object" && "client" in error) {
          setValidationError(error.message);
        }
      },
    });
  }

  const title =
    mode?.kind === "create" ? "Thêm người dùng" : mode?.kind === "edit" ? `Sửa ${mode.user.username}` : mode?.kind === "password" ? `Đặt lại mật khẩu · ${mode.user.username}` : "";

  return (
    <>
      <div className="flex justify-end border-b border-slate-100 px-5 py-3">
        <Button size="sm" onClick={openCreate}>
          <Plus aria-hidden="true" className="size-4" />
          Thêm người dùng
        </Button>
      </div>
      <Table caption="Tài khoản hệ thống">
        <THead>
          <tr>
            <Th>Người dùng</Th>
            <Th>Vai trò</Th>
            <Th>Trạng thái</Th>
            <Th>Ngày tạo</Th>
            <Th>
              <span className="sr-only">Thao tác</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {users.length === 0 ? (
            <EmptyRow colSpan={COLUMN_COUNT}>Chưa có người dùng.</EmptyRow>
          ) : (
            users.map((user) => (
              <tr key={user.id}>
                <Td>
                  <p className="font-medium text-slate-900">{user.fullName}</p>
                  <p className="font-mono text-xs text-slate-500">{user.username}</p>
                </Td>
                <Td>{user.roleDisplayName}</Td>
                <Td>{user.enabled ? <Badge tone="success">Hoạt động</Badge> : <Badge tone="neutral">Khóa</Badge>}</Td>
                <Td className="whitespace-nowrap tabular-nums text-slate-600">{formatDateTime(user.createdAt)}</Td>
                <Td className="text-right whitespace-nowrap">
                  <button
                    type="button"
                    aria-label={`Sửa ${user.username}`}
                    onClick={() => openEdit(user)}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Đặt lại mật khẩu ${user.username}`}
                    onClick={() => openPassword(user)}
                    className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <KeyRound aria-hidden="true" className="size-4" />
                  </button>
                </Td>
              </tr>
            ))
          )}
        </TBody>
      </Table>

      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Hủy
            </Button>
            <Button type="submit" form={formId} disabled={save.isPending}>
              {save.isPending ? "Đang lưu…" : mode?.kind === "password" ? "Đặt mật khẩu" : "Lưu"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="space-y-3">
          {mode?.kind === "create" ? (
            <>
              <Field id={`${formId}-username`} label="Tên đăng nhập">
                <Input id={`${formId}-username`} autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} />
              </Field>
              <Field id={`${formId}-password`} label="Mật khẩu tạm">
                <Input id={`${formId}-password`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </Field>
            </>
          ) : null}
          {mode?.kind === "password" ? (
            <Field id={`${formId}-new-password`} label="Mật khẩu mới">
              <Input id={`${formId}-new-password`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
          ) : null}
          {mode?.kind === "create" || mode?.kind === "edit" ? (
            <>
              <Field id={`${formId}-name`} label="Họ tên">
                <Input id={`${formId}-name`} value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </Field>
              <Field id={`${formId}-role`} label="Vai trò">
                <Select id={`${formId}-role`} value={role} onChange={(event) => setRole(event.target.value as Role)}>
                  {ROLES.map((item) => (
                    <option key={item} value={item}>
                      {roleLabel[item]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : null}
          {mode?.kind === "edit" ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4 accent-brand-600" />
              Tài khoản đang hoạt động
            </label>
          ) : null}
          {validationError || (save.error && !("client" in (save.error as object))) ? (
            <Alert tone="danger">{validationError ?? errorMessage(save.error)}</Alert>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}
