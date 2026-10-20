package vn.edu.hcmunre.pharmawms.inventory.internal.receiving;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptCommand;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptResult;
import vn.edu.hcmunre.pharmawms.inventory.internal.receiving.ReceiptQueries.ReceiptSummary;
import vn.edu.hcmunre.pharmawms.inventory.internal.receiving.ReceiptQueries.ReceiptView;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

/**
 * Direct receipts (no purchase order), e.g. returns or donations. Receipts against a purchase
 * order go through the purchasing module so the order is updated in the same transaction.
 */
@Tag(name = "Goods receipt")
@RestController
@RequestMapping("/api/v1/goods-receipts")
class GoodsReceiptController {

	private static final int MAX_PAGE_SIZE = 100;
	static final int MAX_LINES = 200;

	private final GoodsReceiptService receiptService;
	private final ReceiptQueries queries;
	private final CurrentUser currentUser;

	GoodsReceiptController(GoodsReceiptService receiptService, ReceiptQueries queries, CurrentUser currentUser) {
		this.receiptService = receiptService;
		this.queries = queries;
		this.currentUser = currentUser;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('STOCK_READ')")
	PageResponse<ReceiptSummary> list(@RequestParam(required = false) Long purchaseOrderId,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return queries.list(purchaseOrderId, page, size);
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	ReceiptView get(@PathVariable long id) {
		return queries.view(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('STOCK_RECEIVE')")
	ReceiptResult receive(@RequestHeader(name = "Idempotency-Key", required = false) @Size(max = 64) String idempotencyKey,
			@Valid @RequestBody DirectReceiptRequest request) {
		List<ReceiptCommand.Line> lines = request.lines().stream().map(ReceiptLineRequest::toLine).toList();
		return receiptService.receive(new ReceiptCommand(idempotencyKey, request.supplierId(), null, request.note(),
				currentUser.id(), lines));
	}

	record DirectReceiptRequest(Long supplierId, @Size(max = 500) String note,
			@NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull ReceiptLineRequest> lines) {
	}

	public record ReceiptLineRequest(@NotNull Long productId, @NotBlank @Size(max = 50) String lotNumber,
			LocalDate manufactureDate, @NotNull LocalDate expiryDate, @NotNull Long locationId,
			@NotBlank @Size(max = 20) String unitName, @Positive long quantity,
			@NotNull @DecimalMin("0") BigDecimal unitCostPerBaseUnit) {

		public ReceiptCommand.Line toLine() {
			return new ReceiptCommand.Line(productId, lotNumber, manufactureDate, expiryDate, locationId,
					unitName.trim(), quantity, unitCostPerBaseUnit);
		}

	}

}
