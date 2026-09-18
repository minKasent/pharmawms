package vn.edu.hcmunre.pharmawms.inventory.internal.disposal;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
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

import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.inventory.internal.disposal.DisposalService.DisposalLineView;
import vn.edu.hcmunre.pharmawms.inventory.internal.disposal.DisposalService.DisposalSummary;

@Tag(name = "Disposal")
@RestController
@RequestMapping("/api/v1/disposals")
class DisposalController {

	private static final int MAX_BATCHES = 200;

	private final DisposalService service;
	private final CurrentUser currentUser;

	DisposalController(DisposalService service, CurrentUser currentUser) {
		this.service = service;
		this.currentUser = currentUser;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('STOCK_READ')")
	List<DisposalSummary> list() {
		return service.list();
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	DisposalSummary get(@PathVariable long id) {
		return service.get(id);
	}

	@GetMapping("/{id}/lines")
	@PreAuthorize("hasAuthority('STOCK_READ')")
	List<DisposalLineView> lines(@PathVariable long id) {
		return service.lines(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('STOCK_DISPOSE')")
	Map<String, Long> dispose(@Valid @RequestBody DisposalRequest request) {
		return Map.of("id", service.dispose(request.batchIds(), request.reason().trim(), currentUser.id()));
	}

	record DisposalRequest(@NotEmpty @Size(max = MAX_BATCHES) List<@NotNull Long> batchIds,
			@NotBlank @Size(max = 255) String reason) {
	}

}
