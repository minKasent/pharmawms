import { z } from "zod";

export const isoDate = z.iso.date();
export const isoDateTime = z.iso.datetime({ offset: true });

export function pageOf<Item extends z.ZodType>(item: Item) {
  return z.object({
    content: z.array(item),
    page: z.number().int(),
    size: z.number().int(),
    totalElements: z.number().int(),
    totalPages: z.number().int(),
  });
}

export type Page<Item> = {
  content: Item[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};
