import type { Metadata } from "next";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/features/auth/current-user";
import { Forbidden } from "@/features/auth/forbidden";
import { UserAdminPanel } from "@/features/auth/user-admin-panel";
import { can, userListSchema } from "@/features/auth/user";
import { backendGetOptional } from "@/lib/api/backend";

export const metadata: Metadata = { title: "Người dùng" };

const FORBIDDEN = 403;

async function UsersView() {
  const [session, users] = await Promise.all([
    getCurrentUser(),
    backendGetOptional("/users", userListSchema, [FORBIDDEN]),
  ]);
  if (!can(session, "USER_MANAGE") || !users) {
    return <Forbidden action="quản lý người dùng" />;
  }
  return (
    <Card>
      <UserAdminPanel users={users} />
    </Card>
  );
}

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Người dùng"
        description="Tài khoản theo vai trò (RBAC). Không thể tự khóa hoặc hạ quyền chính mình."
      />
      <Suspense fallback={<LoadingCard label="Đang tải người dùng" rows={6} />}>
        <UsersView />
      </Suspense>
    </>
  );
}
