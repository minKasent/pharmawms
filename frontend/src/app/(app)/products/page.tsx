import Plus from "lucide-react/dist/esm/icons/plus";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingCard } from "@/components/ui/feedback";
import { Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, withQuery } from "@/components/ui/pagination";
import { SearchForm } from "@/components/ui/search-form";
import { EmptyRow, TBody, THead, Table, Td, Th } from "@/components/ui/table";
import { getCurrentUser } from "@/features/auth/current-user";
import { can } from "@/features/auth/user";
import { CategoryManager } from "@/features/catalog/category-manager";
import { type Category, categoryListSchema, productPageSchema } from "@/features/catalog/schemas";
import { storageCondition } from "@/features/inventory/labels";
import { backendGet } from "@/lib/api/backend";
import { enumParam, pageParam, positiveIntParam, stringParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Danh mục thuốc" };

const PAGE_SIZE = 20;
const COLUMN_COUNT = 6;
const ACTIVE_FILTERS = ["true", "false"] as const;

type Filters = { search?: string; categoryId?: number; active?: (typeof ACTIVE_FILTERS)[number] };

function FilterControls({ filters, categories }: { filters: Filters; categories: Category[] }) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="categoryId" className="block text-xs font-medium text-slate-600">
          Nhóm thuốc
        </label>
        <Select id="categoryId" name="categoryId" defaultValue={filters.categoryId ?? ""} className="w-52">
          <option value="">Tất cả nhóm</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="active" className="block text-xs font-medium text-slate-600">
          Trạng thái
        </label>
        <Select id="active" name="active" defaultValue={filters.active ?? ""} className="w-40">
          <option value="">Tất cả</option>
          <option value="true">Đang dùng</option>
          <option value="false">Ngừng sử dụng</option>
        </Select>
      </div>
    </>
  );
}

async function ProductTable({ filters, page }: { filters: Filters; page: number }) {
  const [products, categories] = await Promise.all([
    backendGet(withQuery("/products", { ...filters, page, size: PAGE_SIZE }), productPageSchema),
    backendGet("/categories", categoryListSchema),
  ]);
  return (
    <>
      <div className="border-b border-slate-100 px-5 py-4">
        <SearchForm action="/products" defaultValue={filters.search} label="Tìm thuốc" placeholder="Tên thuốc, hoạt chất hoặc mã SKU…">
          <FilterControls filters={filters} categories={categories} />
        </SearchForm>
      </div>
      <Table caption="Danh mục thuốc">
        <THead>
          <tr>
            <Th>Thuốc</Th>
            <Th>Hoạt chất</Th>
            <Th>Nhóm</Th>
            <Th>Bảo quản</Th>
            <Th>Đơn vị cơ sở</Th>
            <Th>Trạng thái</Th>
          </tr>
        </THead>
        <TBody>
          {products.content.length === 0 ? (
            <EmptyRow colSpan={COLUMN_COUNT}>Không có thuốc phù hợp.</EmptyRow>
          ) : (
            products.content.map((product) => {
              const storage = storageCondition(product.storageCondition);
              return (
                <tr key={product.id} className="hover:bg-slate-50">
                  <Td className="min-w-56">
                    <Link href={`/products/${product.id}`} className="font-medium text-slate-900 hover:underline">
                      {product.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {product.sku}
                      {product.dosageForm ? ` · ${product.dosageForm}` : ""}
                    </span>
                  </Td>
                  <Td className="text-slate-700">{[product.activeIngredient, product.strength].filter(Boolean).join(" ")}</Td>
                  <Td className="text-slate-600">{product.categoryName}</Td>
                  <Td>
                    <Badge tone={storage.tone}>{storage.label}</Badge>
                  </Td>
                  <Td>{product.baseUnit}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {product.active ? <Badge tone="success">Đang dùng</Badge> : <Badge tone="neutral">Ngừng</Badge>}
                      {product.prescriptionRequired ? <Badge tone="violet">Kê đơn</Badge> : null}
                    </span>
                  </Td>
                </tr>
              );
            })
          )}
        </TBody>
      </Table>
      <Pagination
        page={products.page}
        totalPages={products.totalPages}
        totalElements={products.totalElements}
        hrefFor={(target) => withQuery("/products", { ...filters, page: target })}
      />
    </>
  );
}

async function NewProductAction() {
  const user = await getCurrentUser();
  if (!can(user, "CATALOG_MANAGE")) return null;
  const categories = await backendGet("/categories", categoryListSchema);
  return (
    <>
      <CategoryManager categories={categories} />
      <ButtonLink href="/products/new">
        <Plus aria-hidden="true" className="size-4" />
        Thêm thuốc
      </ButtonLink>
    </>
  );
}

export default function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <>
      <PageHeader
        title="Danh mục thuốc"
        description="Thông tin dược, điều kiện bảo quản và quy cách đóng gói quy đổi về đơn vị cơ sở."
        actions={
          <Suspense>
            <NewProductAction />
          </Suspense>
        }
      />
      <Card>
        <Suspense fallback={<LoadingCard label="Đang tải danh mục thuốc" rows={10} />}>
          {searchParams.then((params) => (
            <ProductTable
              filters={{
                search: stringParam(params.search),
                categoryId: positiveIntParam(params.categoryId),
                active: enumParam(params.active, ACTIVE_FILTERS),
              }}
              page={pageParam(params.page)}
            />
          ))}
        </Suspense>
      </Card>
    </>
  );
}
