package vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion.SuggestionService.OrderItem;
import vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion.SuggestionService.OrderResult;
import vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion.SuggestionService.Status;
import vn.edu.hcmunre.pharmawms.forecasting.internal.suggestion.SuggestionService.SuggestionView;
import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Tag(name = "Purchase suggestions")
@RestController
@RequestMapping("/api/v1/purchase-suggestions")
class SuggestionController {

	private static final int MAX_PAGE_SIZE = 100;
	private static final int MAX_ITEMS = 200;

	private final SuggestionService service;
	private final CurrentUser currentUser;

	SuggestionController(SuggestionService service, CurrentUser currentUser) {
		this.service = service;
		this.currentUser = currentUser;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('FORECAST_READ')")
	PageResponse<SuggestionView> search(@RequestParam(defaultValue = "OPEN") Status status,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return service.search(status, page, size);
	}

	@PostMapping("/orders")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	OrderResult createOrders(@Valid @RequestBody CreateOrdersRequest request) {
		List<OrderItem> items = request.items().stream().map(i -> new OrderItem(i.suggestionId(), i.quantity())).toList();
		return service.createOrders(items, currentUser.id());
	}

	@PostMapping("/{id}/dismiss")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_MANAGE')")
	void dismiss(@PathVariable long id) {
		service.dismiss(id);
	}

	record CreateOrdersRequest(@NotEmpty @Size(max = MAX_ITEMS) List<@Valid @NotNull OrderItemRequest> items) {
	}

	record OrderItemRequest(@NotNull Long suggestionId, @Positive @Max(1_000_000_000L) Long quantity) {
	}

}
