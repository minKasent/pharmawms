import { z } from "zod";

export const PERMISSIONS = [
  "USER_MANAGE",
  "CATALOG_READ",
  "CATALOG_MANAGE",
  "WAREHOUSE_MANAGE",
  "STOCK_READ",
  "STOCK_RECEIVE",
  "STOCK_ISSUE",
  "STOCK_COUNT",
  "STOCK_ADJUST_APPROVE",
  "BATCH_HOLD",
  "STOCK_DISPOSE",
  "FORECAST_READ",
  "FORECAST_RUN",
  "SUPPLIER_MANAGE",
  "PURCHASE_ORDER_READ",
  "PURCHASE_ORDER_MANAGE",
  "PURCHASE_ORDER_APPROVE",
  "DASHBOARD_READ",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["ADMIN", "PHARMACIST_MANAGER", "STOREKEEPER", "PURCHASER"] as const;
export type Role = (typeof ROLES)[number];

/** Mirrors backend Role.displayName — used on create/edit forms before the server echoes it back. */
export const roleLabel: Record<Role, string> = {
  ADMIN: "Quản trị hệ thống",
  PHARMACIST_MANAGER: "Dược sĩ phụ trách",
  STOREKEEPER: "Thủ kho",
  PURCHASER: "Nhân viên mua hàng",
};

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  fullName: z.string(),
  role: z.enum(ROLES),
  roleDisplayName: z.string(),
  enabled: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: z.string().nullish(),
});

export type User = z.infer<typeof userSchema>;
export const userListSchema = z.array(userSchema);

/** What Client Components and Server Pages receive from /me. */
export type SessionUser = Pick<User, "id" | "fullName" | "roleDisplayName"> & { permissions: Permission[] };

export function toSessionUser(user: User): SessionUser {
  const known = new Set<string>(PERMISSIONS);
  return {
    id: user.id,
    fullName: user.fullName,
    roleDisplayName: user.roleDisplayName,
    permissions: user.permissions.filter((permission): permission is Permission => known.has(permission)),
  };
}

export function can(user: Pick<SessionUser, "permissions">, permission: Permission): boolean {
  return user.permissions.includes(permission);
}
