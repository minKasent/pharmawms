package vn.edu.hcmunre.pharmawms.inventory.internal.expiry;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.inventory.internal.expiry.ExpiryRiskQueries.ExpiryHeatmap;
import vn.edu.hcmunre.pharmawms.inventory.internal.expiry.ExpiryRiskQueries.InventoryKpis;

@Tag(name = "Dashboard")
@RestController
@RequestMapping("/api/v1/dashboard")
class ExpiryRiskController {

	private final ExpiryRiskQueries queries;

	ExpiryRiskController(ExpiryRiskQueries queries) {
		this.queries = queries;
	}

	@GetMapping("/inventory-kpis")
	@PreAuthorize("hasAuthority('DASHBOARD_READ')")
	InventoryKpis kpis() {
		return queries.kpis();
	}

	@GetMapping("/expiry-heatmap")
	@PreAuthorize("hasAuthority('DASHBOARD_READ')")
	ExpiryHeatmap heatmap() {
		return queries.heatmap();
	}

}
