package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.util.List;

import jakarta.validation.Valid;
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
import vn.edu.hcmunre.pharmawms.inventory.internal.InventoryProperties;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssuePreview;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueSummary;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueView;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Tag(name = "Goods issue (FEFO)")
@RestController
@RequestMapping("/api/v1/goods-issues")
class GoodsIssueController {

	private static final int MAX_PAGE_SIZE = 100;
	private static final int MAX_LINES = 200;

	private final IssuingService issuingService;
	private final IssueQueries queries;
	private final CurrentUser currentUser;
	private final InventoryProperties properties;

	GoodsIssueController(IssuingService issuingService, IssueQueries queries, CurrentUser currentUser,
			InventoryProperties properties) {
		this.issuingService = issuingService;
		this.queries = queries;
		this.currentUser = currentUser;
		this.properties = properties;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('STOCK_READ')")
	PageResponse<IssueSummary> list(@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return queries.list(page, size);
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	IssueView get(@PathVariable long id) {
		return queries.view(id, false);
	}

	@PostMapping("/preview")
	@PreAuthorize("hasAuthority('STOCK_ISSUE')")
	IssuePreview preview(@Valid @RequestBody IssueRequest request) {
		return issuingService.preview(toCommand(null, request));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('STOCK_ISSUE')")
	IssueView issue(@RequestHeader(name = "Idempotency-Key", required = false) @Size(max = 64) String idempotencyKey,
			@Valid @RequestBody IssueRequest request) {
		return issuingService.issue(toCommand(idempotencyKey, request));
	}

	private IssueCommand toCommand(String idempotencyKey, IssueRequest request) {
		int minDays = request.minRemainingShelfLifeDays() != null ? request.minRemainingShelfLifeDays()
				: properties.defaultMinRemainingShelfLifeDays();
		List<IssueCommand.Line> lines = request.lines()
			.stream()
			.map(line -> new IssueCommand.Line(line.productId(), line.unitName().trim(), line.quantity()))
			.toList();
		return new IssueCommand(idempotencyKey, request.destination().trim(), minDays, request.note(),
				currentUser.id(), lines);
	}

	record IssueRequest(@NotBlank @Size(max = 200) String destination,
			@Min(1) @Max(InventoryProperties.MAX_SHELF_LIFE_DAYS) Integer minRemainingShelfLifeDays,
			@Size(max = 500) String note, @NotEmpty @Size(max = MAX_LINES) List<@Valid @NotNull LineRequest> lines) {
	}

	record LineRequest(@NotNull Long productId, @NotBlank @Size(max = 20) String unitName,
			@Positive long quantity) {
	}

}
