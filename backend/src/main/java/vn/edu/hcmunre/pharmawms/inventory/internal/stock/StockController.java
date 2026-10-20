package vn.edu.hcmunre.pharmawms.inventory.internal.stock;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockQueries.BatchTraceability;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockQueries.BatchView;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockQueries.ProductStock;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockQueries.ReconciliationReport;
import vn.edu.hcmunre.pharmawms.inventory.internal.stock.StockQueries.StockCard;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Tag(name = "Stock")
@RestController
@RequestMapping("/api/v1")
class StockController {

	private static final int MAX_PAGE_SIZE = 100;
	private static final int MAX_EXPIRY_WINDOW_DAYS = 3650;
	private static final int MAX_STOCK_CARD_DAYS = 366;
	private static final int DEFAULT_STOCK_CARD_DAYS = 30;

	private final StockQueries queries;
	private final BatchService batchService;
	private final Clock clock;

	StockController(StockQueries queries, BatchService batchService, Clock clock) {
		this.queries = queries;
		this.batchService = batchService;
		this.clock = clock;
	}

	@GetMapping("/stock")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	PageResponse<ProductStock> overview(@RequestParam(required = false) @Size(max = 100) String search,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return queries.overview(search, page, size);
	}

	@GetMapping("/stock/reconciliation")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	ReconciliationReport reconciliation() {
		return queries.reconcile();
	}

	@GetMapping("/batches")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	List<BatchView> batches(@RequestParam(required = false) Long productId,
			@RequestParam(required = false) BatchStatus status,
			@RequestParam(required = false) @Min(0) @Max(MAX_EXPIRY_WINDOW_DAYS) Integer expiringWithinDays) {
		return queries.batches(productId, status, expiringWithinDays);
	}

	@GetMapping("/batches/{id}/traceability")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	BatchTraceability batchTraceability(@PathVariable long id) {
		return queries.batchTraceability(id);
	}

	@PostMapping("/batches/{id}/hold")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('BATCH_HOLD')")
	void hold(@PathVariable long id, @Valid @RequestBody HoldRequest request) {
		batchService.hold(id, request.reason().trim());
	}

	@PostMapping("/batches/{id}/release")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('BATCH_HOLD')")
	void release(@PathVariable long id) {
		batchService.release(id);
	}

	@GetMapping("/products/{productId}/stock-card")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	StockCard stockCard(@PathVariable long productId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		LocalDate end = to != null ? to : LocalDate.now(clock);
		LocalDate start = from != null ? from : end.minusDays(DEFAULT_STOCK_CARD_DAYS);
		if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) > MAX_STOCK_CARD_DAYS) {
			throw BusinessException.unprocessable("INVALID_DATE_RANGE",
					"Khoảng thời gian không hợp lệ (tối đa %d ngày).".formatted(MAX_STOCK_CARD_DAYS));
		}
		return queries.stockCard(productId, start, end);
	}

	@GetMapping("/exports/stock-movements")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	ResponseEntity<byte[]> exportStockMovements(
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		LocalDate end = to != null ? to : LocalDate.now(clock);
		LocalDate start = from != null ? from : end.minusDays(DEFAULT_STOCK_CARD_DAYS);
		if (start.isAfter(end) || ChronoUnit.DAYS.between(start, end) > MAX_STOCK_CARD_DAYS) {
			throw BusinessException.unprocessable("INVALID_DATE_RANGE",
					"Khoảng thời gian không hợp lệ (tối đa %d ngày).".formatted(MAX_STOCK_CARD_DAYS));
		}
		return ResponseEntity.ok()
			.header(HttpHeaders.CONTENT_TYPE, "text/csv; charset=UTF-8")
			.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"stock-movements.csv\"")
			.body(queries.exportStockMovementsCsv(start, end));
	}

	record HoldRequest(@NotBlank @Size(max = 255) String reason) {
	}

}
