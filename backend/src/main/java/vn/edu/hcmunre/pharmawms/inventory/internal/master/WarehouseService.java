package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class WarehouseService {

	private final WarehouseRepository warehouses;
	private final ZoneRepository zones;
	private final LocationRepository locations;

	WarehouseService(WarehouseRepository warehouses, ZoneRepository zones, LocationRepository locations) {
		this.warehouses = warehouses;
		this.zones = zones;
		this.locations = locations;
	}

	/**
	 * The whole layout in three queries; warehouses are few, so no paging.
	 */
	@Transactional(readOnly = true)
	public List<WarehouseView> layout() {
		Map<Long, List<LocationView>> locationsByZone = locations.findAll()
			.stream()
			.sorted(Comparator.comparing(Location::getCode))
			.collect(Collectors.groupingBy(Location::getZoneId,
					Collectors.mapping(l -> new LocationView(l.getId(), l.getCode(), l.isActive()),
							Collectors.toList())));
		Map<Long, List<ZoneView>> zonesByWarehouse = zones.findAll()
			.stream()
			.sorted(Comparator.comparing(Zone::getCode))
			.collect(Collectors.groupingBy(Zone::getWarehouseId,
					Collectors.mapping(z -> new ZoneView(z.getId(), z.getCode(), z.getName(), z.getStorageCondition(),
							locationsByZone.getOrDefault(z.getId(), List.of())), Collectors.toList())));
		return warehouses.findAll()
			.stream()
			.sorted(Comparator.comparing(Warehouse::getCode))
			.map(w -> new WarehouseView(w.getId(), w.getCode(), w.getName(), w.getAddress(),
					zonesByWarehouse.getOrDefault(w.getId(), List.of())))
			.toList();
	}

	@Transactional
	public long createWarehouse(String code, String name, String address) {
		String normalized = normalizeCode(code);
		if (warehouses.existsByCodeIgnoreCase(normalized)) {
			throw BusinessException.conflict("WAREHOUSE_CODE_TAKEN", "Mã kho '%s' đã tồn tại.".formatted(normalized));
		}
		return warehouses.save(new Warehouse(normalized, name.trim(), address)).getId();
	}

	@Transactional
	public long createZone(long warehouseId, String code, String name, StorageCondition storageCondition) {
		if (!warehouses.existsById(warehouseId)) {
			throw BusinessException.notFound("WAREHOUSE_NOT_FOUND", "Không tìm thấy kho #" + warehouseId);
		}
		String normalized = normalizeCode(code);
		if (zones.existsByWarehouseIdAndCodeIgnoreCase(warehouseId, normalized)) {
			throw BusinessException.conflict("ZONE_CODE_TAKEN", "Mã khu '%s' đã tồn tại.".formatted(normalized));
		}
		return zones.save(new Zone(warehouseId, normalized, name.trim(), storageCondition)).getId();
	}

	@Transactional
	public long createLocation(long zoneId, String code) {
		if (!zones.existsById(zoneId)) {
			throw BusinessException.notFound("ZONE_NOT_FOUND", "Không tìm thấy khu #" + zoneId);
		}
		String normalized = normalizeCode(code);
		if (locations.existsByZoneIdAndCodeIgnoreCase(zoneId, normalized)) {
			throw BusinessException.conflict("LOCATION_CODE_TAKEN", "Mã vị trí '%s' đã tồn tại.".formatted(normalized));
		}
		return locations.save(new Location(zoneId, normalized)).getId();
	}

	@Transactional
	public void setLocationActive(long locationId, boolean active) {
		locations.findById(locationId)
			.orElseThrow(() -> BusinessException.notFound("LOCATION_NOT_FOUND", "Không tìm thấy vị trí #" + locationId))
			.setActive(active);
	}

	private static String normalizeCode(String code) {
		return code.trim().toUpperCase(Locale.ROOT);
	}

	public record WarehouseView(long id, String code, String name, String address, List<ZoneView> zones) {
	}

	public record ZoneView(long id, String code, String name, StorageCondition storageCondition,
			List<LocationView> locations) {
	}

	public record LocationView(long id, String code, boolean active) {
	}

}
