package vn.edu.hcmunre.pharmawms.inventory.internal.stocktake;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.inventory.internal.stocktake.StockTakeQueries.StockTakeSummary;
import vn.edu.hcmunre.pharmawms.inventory.internal.stocktake.StockTakeQueries.StockTakeView;

@Tag(name = "Stock take")
@RestController
@RequestMapping("/api/v1/stock-takes")
class StockTakeController {

	private static final int MAX_COUNT_LINES = 1000;

	private final StockTakeService service;
	private final StockTakeQueries queries;
	private final CurrentUser currentUser;

	StockTakeController(StockTakeService service, StockTakeQueries queries, CurrentUser currentUser) {
		this.service = service;
		this.queries = queries;
		this.currentUser = currentUser;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('STOCK_READ')")
	List<StockTakeSummary> list() {
		return queries.list();
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	StockTakeView get(@PathVariable long id) {
		return queries.view(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('STOCK_COUNT')")
	StockTakeView create(@Valid @RequestBody CreateStockTakeRequest request) {
		return queries.view(service.create(request.zoneId(), currentUser.id()));
	}

	@PutMapping("/{id}/counts")
	@PreAuthorize("hasAuthority('STOCK_COUNT')")
	StockTakeView recordCounts(@PathVariable long id, @Valid @RequestBody RecordCountsRequest request) {
		Map<Long, Long> counts = request.counts()
			.stream()
			.collect(Collectors.toMap(CountRequest::lineId, CountRequest::countedQuantity, (first, second) -> second));
		service.recordCounts(id, counts);
		return queries.view(id);
	}

	@PostMapping("/{id}/submit")
	@PreAuthorize("hasAuthority('STOCK_COUNT')")
	StockTakeView submit(@PathVariable long id) {
		service.submit(id);
		return queries.view(id);
	}

	@PostMapping("/{id}/approve")
	@PreAuthorize("hasAuthority('STOCK_ADJUST_APPROVE')")
	StockTakeView approve(@PathVariable long id) {
		service.approve(id, currentUser.id());
		return queries.view(id);
	}

	@PostMapping("/{id}/cancel")
	@PreAuthorize("hasAuthority('STOCK_COUNT')")
	StockTakeView cancel(@PathVariable long id) {
		service.cancel(id);
		return queries.view(id);
	}

	record CreateStockTakeRequest(@NotNull Long zoneId) {
	}

	record RecordCountsRequest(@NotEmpty @Size(max = MAX_COUNT_LINES) List<@Valid @NotNull CountRequest> counts) {
	}

	record CountRequest(@NotNull Long lineId, @NotNull @PositiveOrZero Long countedQuantity) {
	}

}
