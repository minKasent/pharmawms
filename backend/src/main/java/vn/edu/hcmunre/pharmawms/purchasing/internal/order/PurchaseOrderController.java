package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService.LineInput;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService.ReceiveLineInput;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderService.ReceiveResult;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.PurchaseOrderSummary;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.PurchaseOrderView;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Tag(name = "Purchase orders")
@RestController
@RequestMapping("/api/v1/purchase-orders")
class PurchaseOrderController {

	private static final int MAX_PAGE_SIZE = 100;
	private static final int MAX_LINES = 200;

	private final PurchaseOrderService service;
	private final CurrentUser currentUser;

	PurchaseOrderController(PurchaseOrderService service, CurrentUser currentUser) {
		this.service = service;
		this.currentUser = currentUser;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_READ')")
	PageResponse<PurchaseOrderSummary> search(@RequestParam(required = false) PurchaseOrderStatus status,
			@RequestParam(required = false) Long supplierId, @RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return service.search(status, supplierId, page, size);
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_READ')")
	PurchaseOrderView get(@PathVariable long id) {
		return service.view(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	PurchaseOrderView create(@Valid @RequestBody CreateOrderRequest request) {
		return service.create(request.supplierId(), PurchaseOrderSource.MANUAL, request.note(),
				toInputs(request.lines()), currentUser.id());
	}

	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	PurchaseOrderView update(@PathVariable long id, @Valid @RequestBody UpdateOrderRequest request) {
		return service.update(id, request.version(), request.note(), toInputs(request.lines()));
	}

	@PostMapping("/{id}/submit")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	PurchaseOrderView submit(@PathVariable long id) {
		return service.submit(id, currentUser.id());
	}

	@PostMapping("/{id}/approve")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_APPROVE')")
	PurchaseOrderView approve(@PathVariable long id) {
		return service.approve(id, currentUser.id());
	}

	@PostMapping("/{id}/reject")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_APPROVE')")
	PurchaseOrderView reject(@PathVariable long id, @Valid @RequestBody ReasonRequest request) {
		return service.reject(id, currentUser.id(), request.reason().trim());
	}

	@PostMapping("/{id}/send")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	PurchaseOrderView send(@PathVariable long id) {
		return service.markSent(id, currentUser.id());
	}

	@PostMapping("/{id}/cancel")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	PurchaseOrderView cancel(@PathVariable long id, @Valid @RequestBody ReasonRequest request) {
		return service.cancel(id, currentUser.id(), request.reason().trim());
	}

	@PostMapping("/{id}/close")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	PurchaseOrderView closeShort(@PathVariable long id, @Valid @RequestBody ReasonRequest request) {
		return service.closeShort(id, currentUser.id(), request.reason().trim());
	}

	@PostMapping("/{id}/receipts")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('STOCK_RECEIVE')")
	ReceiveResult receive(@PathVariable long id,
			@RequestHeader(name = "Idempotency-Key", required = false) @Size(max = 64) String idempotencyKey,
			@Valid @RequestBody ReceiveRequest request) {
		List<ReceiveLineInput> lines = request.lines()
			.stream()
			.map(line -> new ReceiveLineInput(line.productId(), line.lotNumber(), line.manufactureDate(),
					line.expiryDate(), line.locationId(), line.unitName().trim(), line.quantity(),
					line.unitCostPerBaseUnit()))
			.toList();
		return service.receive(id, idempotencyKey, request.note(), lines, currentUser.id());
	}

	private static List<LineInput> toInputs(List<OrderLineRequest> lines) {
		return lines.stream()
			.map(line -> new LineInput(line.productId(), line.unitName() == null ? null : line.unitName().trim(),
					line.quantity(), line.unitPrice(), null))
			.toList();
	}

	record CreateOrderRequest(@NotNull Long supplierId, @Size(max = 500) String note,
			@NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull OrderLineRequest> lines) {
	}

	record UpdateOrderRequest(@NotNull Long version, @Size(max = 500) String note,
			@NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull OrderLineRequest> lines) {
	}

	record OrderLineRequest(@NotNull Long productId, @Size(max = 20) String unitName, @Positive long quantity,
			@DecimalMin("0") BigDecimal unitPrice) {
	}

	record ReasonRequest(@NotBlank @Size(max = 500) String reason) {
	}

	record ReceiveRequest(@Size(max = 500) String note,
			@NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull ReceiveLineRequest> lines) {
	}

	record ReceiveLineRequest(@NotNull Long productId, @NotBlank @Size(max = 50) String lotNumber,
			LocalDate manufactureDate, @NotNull LocalDate expiryDate, @NotNull Long locationId,
			@NotBlank @Size(max = 20) String unitName, @Positive long quantity,
			@DecimalMin("0") BigDecimal unitCostPerBaseUnit) {
	}

}
