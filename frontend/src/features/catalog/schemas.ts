import { z } from "zod";

import { isoDateTime, pageOf } from "@/lib/api/schemas";
import { STORAGE_CONDITIONS } from "@/features/inventory/labels";

export const categorySchema = z.object({ id: z.number(), code: z.string(), name: z.string() });
export const categoryListSchema = z.array(categorySchema);
export type Category = z.infer<typeof categorySchema>;

export const productListItemSchema = z.object({
  id: z.number(),
  sku: z.string(),
  name: z.string(),
  activeIngredient: z.string(),
  strength: z.string().nullish(),
  dosageForm: z.string().nullish(),
  categoryId: z.number(),
  categoryName: z.string(),
  storageCondition: z.enum(STORAGE_CONDITIONS),
  baseUnit: z.string(),
  prescriptionRequired: z.boolean(),
  active: z.boolean(),
});
export type ProductListItem = z.infer<typeof productListItemSchema>;
export const productPageSchema = pageOf(productListItemSchema);

export const productUnitSchema = z.object({
  unitName: z.string(),
  factorToBase: z.number(),
  gtin: z.string().nullish(),
});
export type ProductUnit = z.infer<typeof productUnitSchema>;

export const productDetailSchema = z.object({
  id: z.number(),
  sku: z.string(),
  name: z.string(),
  activeIngredient: z.string(),
  strength: z.string().nullish(),
  dosageForm: z.string().nullish(),
  registrationNumber: z.string().nullish(),
  manufacturer: z.string().nullish(),
  atcCode: z.string().nullish(),
  categoryId: z.number(),
  categoryName: z.string(),
  storageCondition: z.enum(STORAGE_CONDITIONS),
  prescriptionRequired: z.boolean(),
  baseUnit: z.string(),
  minShelfLifeOnReceiptDays: z.number(),
  referenceUnitCost: z.number(),
  active: z.boolean(),
  units: z.array(productUnitSchema),
  createdAt: isoDateTime.nullish(),
  updatedAt: isoDateTime.nullish(),
  version: z.number(),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;
