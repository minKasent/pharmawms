package vn.edu.hcmunre.pharmawms.purchasing.internal.supplier;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.Supplier.SupplierDetails;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierService.SupplierView;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierService.TermsView;

@Tag(name = "Suppliers")
@RestController
@RequestMapping("/api/v1/suppliers")
class SupplierController {

	private static final int MAX_LEAD_TIME_DAYS = 365;

	private final SupplierService service;

	SupplierController(SupplierService service) {
		this.service = service;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_READ')")
	List<SupplierView> list() {
		return service.list();
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_READ')")
	SupplierView get(@PathVariable long id) {
		return service.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('SUPPLIER_MANAGE')")
	SupplierView create(@Valid @RequestBody CreateSupplierRequest request) {
		return service.create(request.code(), request.details().toDetails());
	}

	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('SUPPLIER_MANAGE')")
	SupplierView update(@PathVariable long id, @Valid @RequestBody UpdateSupplierRequest request) {
		return service.update(id, request.details().toDetails(), request.active());
	}

	@GetMapping("/{id}/products")
	@PreAuthorize("hasAuthority('PURCHASE_ORDER_READ')")
	List<TermsView> terms(@PathVariable long id) {
		return service.termsOf(id);
	}

	@PutMapping("/{id}/products/{productId}")
	@PreAuthorize("hasAuthority('SUPPLIER_MANAGE')")
	TermsView upsertTerms(@PathVariable long id, @PathVariable long productId,
			@Valid @RequestBody TermsRequest request) {
		return service.upsertTerms(id, productId, request.packSize(), request.minOrderQuantity(), request.unitPrice(),
				request.preferred());
	}

	@DeleteMapping("/{id}/products/{productId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('SUPPLIER_MANAGE')")
	void deleteTerms(@PathVariable long id, @PathVariable long productId) {
		service.deleteTerms(id, productId);
	}

	record CreateSupplierRequest(@NotBlank @Size(max = 20) @Pattern(regexp = "^[A-Za-z0-9._-]+$") String code,
			@Valid @NotNull SupplierFields details) {
	}

	record UpdateSupplierRequest(@Valid @NotNull SupplierFields details, boolean active) {
	}

	record SupplierFields(@NotBlank @Size(max = 200) String name, @Size(max = 30) String phone,
			@Email @Size(max = 100) String email, @Size(max = 255) String address,
			@Min(1) @Max(MAX_LEAD_TIME_DAYS) int defaultLeadTimeDays) {

		SupplierDetails toDetails() {
			return new SupplierDetails(name.trim(), blankToNull(phone), blankToNull(email), blankToNull(address),
					defaultLeadTimeDays);
		}

		private static String blankToNull(String value) {
			return value == null || value.isBlank() ? null : value.trim();
		}

	}

	record TermsRequest(@Positive long packSize, @PositiveOrZero long minOrderQuantity,
			@NotNull @DecimalMin("0") BigDecimal unitPrice, boolean preferred) {
	}

}
