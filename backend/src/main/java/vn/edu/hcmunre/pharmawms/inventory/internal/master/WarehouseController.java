package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;
import vn.edu.hcmunre.pharmawms.inventory.internal.master.WarehouseService.WarehouseView;

@Tag(name = "Warehouse layout")
@RestController
@RequestMapping("/api/v1")
class WarehouseController {

	private static final String CODE_PATTERN = "^[A-Za-z0-9._-]+$";

	private final WarehouseService warehouseService;

	WarehouseController(WarehouseService warehouseService) {
		this.warehouseService = warehouseService;
	}

	@GetMapping("/warehouses")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	List<WarehouseView> layout() {
		return warehouseService.layout();
	}

	@PostMapping("/warehouses")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('WAREHOUSE_MANAGE')")
	Map<String, Long> createWarehouse(@Valid @RequestBody CreateWarehouseRequest request) {
		return Map.of("id", warehouseService.createWarehouse(request.code(), request.name(), request.address()));
	}

	@PostMapping("/warehouses/{warehouseId}/zones")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('WAREHOUSE_MANAGE')")
	Map<String, Long> createZone(@PathVariable long warehouseId, @Valid @RequestBody CreateZoneRequest request) {
		return Map.of("id",
				warehouseService.createZone(warehouseId, request.code(), request.name(), request.storageCondition()));
	}

	@PostMapping("/zones/{zoneId}/locations")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('WAREHOUSE_MANAGE')")
	Map<String, Long> createLocation(@PathVariable long zoneId, @Valid @RequestBody CreateLocationRequest request) {
		return Map.of("id", warehouseService.createLocation(zoneId, request.code()));
	}

	@PostMapping("/locations/{locationId}/activation")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('WAREHOUSE_MANAGE')")
	void setLocationActive(@PathVariable long locationId, @Valid @RequestBody ActivationRequest request) {
		warehouseService.setLocationActive(locationId, request.active());
	}

	record CreateWarehouseRequest(@NotBlank @Size(max = 20) @Pattern(regexp = CODE_PATTERN) String code,
			@NotBlank @Size(max = 100) String name, @Size(max = 255) String address) {
	}

	record CreateZoneRequest(@NotBlank @Size(max = 20) @Pattern(regexp = CODE_PATTERN) String code,
			@NotBlank @Size(max = 100) String name, @NotNull StorageCondition storageCondition) {
	}

	record CreateLocationRequest(@NotBlank @Size(max = 30) @Pattern(regexp = CODE_PATTERN) String code) {
	}

	record ActivationRequest(boolean active) {
	}

}
