import type { StorageCondition } from "./labels";
import type { Warehouse } from "./schemas";

/** Serializable location list handed from the server page to receipt forms. */
export type LocationOption = { id: number; code: string; zoneName: string; storageCondition: StorageCondition };

export function toLocationOptions(warehouses: Warehouse[]): LocationOption[] {
  return warehouses.flatMap((warehouse) =>
    warehouse.zones.flatMap((zone) =>
      zone.locations
        .filter((location) => location.active)
        .map((location) => ({ id: location.id, code: location.code, zoneName: zone.name, storageCondition: zone.storageCondition })),
    ),
  );
}

/** Receipts must go to a zone with the product's storage condition (GSP); the backend enforces it too. */
export function locationsFor(locations: LocationOption[], storageCondition: string | undefined): LocationOption[] {
  return storageCondition ? locations.filter((location) => location.storageCondition === storageCondition) : locations;
}
