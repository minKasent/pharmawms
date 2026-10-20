package vn.edu.hcmunre.pharmawms.catalog.internal.web;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;
import vn.edu.hcmunre.pharmawms.catalog.internal.application.ProductDetailView;
import vn.edu.hcmunre.pharmawms.catalog.internal.application.ProductListItem;
import vn.edu.hcmunre.pharmawms.catalog.internal.application.ProductService;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product.UnitDefinition;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.ProductDetails;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Tag(name = "Catalog")
@RestController
@RequestMapping("/api/v1/products")
class ProductController {

	private static final int MAX_PAGE_SIZE = 100;
	private static final int MAX_SHELF_LIFE_DAYS = 3650;

	private final ProductService productService;

	ProductController(ProductService productService) {
		this.productService = productService;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('CATALOG_READ')")
	PageResponse<ProductListItem> search(@RequestParam(required = false) @Size(max = 100) String search,
			@RequestParam(required = false) Long categoryId, @RequestParam(required = false) Boolean active,
			@RequestParam(defaultValue = "0") @Min(0) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(MAX_PAGE_SIZE) int size) {
		return productService.search(search, categoryId, active, PageRequest.of(page, size, Sort.by("sku")));
	}

	@GetMapping("/{id}")
	@PreAuthorize("hasAuthority('CATALOG_READ')")
	ProductDetailView get(@PathVariable long id) {
		return productService.get(id);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('CATALOG_MANAGE')")
	ProductDetailView create(@Valid @RequestBody CreateProductRequest request) {
		return productService.create(request.sku(), request.product().toDetails(), request.product().categoryId(),
				request.product().toUnits());
	}

	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('CATALOG_MANAGE')")
	ProductDetailView update(@PathVariable long id, @Valid @RequestBody UpdateProductRequest request) {
		return productService.update(id, request.version(), request.product().toDetails(),
				request.product().categoryId(), request.product().toUnits());
	}

	@PostMapping("/{id}/activation")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('CATALOG_MANAGE')")
	void setActive(@PathVariable long id, @Valid @RequestBody ActivationRequest request) {
		productService.setActive(id, request.active());
	}

	record CreateProductRequest(@NotBlank @Size(max = 30) @Pattern(regexp = "^[A-Za-z0-9._-]+$") String sku,
			@Valid @NotNull ProductFields product) {
	}

	record UpdateProductRequest(@NotNull Long version, @Valid @NotNull ProductFields product) {
	}

	record ActivationRequest(boolean active) {
	}

	record ProductFields(@NotBlank @Size(max = 200) String name, @NotBlank @Size(max = 200) String activeIngredient,
			@Size(max = 100) String strength, @Size(max = 50) String dosageForm,
			@Size(max = 50) String registrationNumber, @Size(max = 200) String manufacturer,
			@Size(max = 10) String atcCode, @NotNull Long categoryId, @NotNull StorageCondition storageCondition,
			boolean prescriptionRequired, @NotBlank @Size(max = 20) String baseUnit,
			@Min(0) @Max(MAX_SHELF_LIFE_DAYS) int minShelfLifeOnReceiptDays,
			@NotNull @DecimalMin("0") BigDecimal referenceUnitCost,
			@NotNull @Size(max = 10) List<@Valid UnitFields> units) {

		ProductDetails toDetails() {
			return new ProductDetails(name.trim(), activeIngredient.trim(), blankToNull(strength),
					blankToNull(dosageForm), blankToNull(registrationNumber), blankToNull(manufacturer),
					blankToNull(atcCode), storageCondition, prescriptionRequired, baseUnit.trim(),
					minShelfLifeOnReceiptDays, referenceUnitCost);
		}

		List<UnitDefinition> toUnits() {
			return units.stream()
				.map(unit -> new UnitDefinition(unit.unitName().trim(), unit.factorToBase(), blankToNull(unit.gtin())))
				.toList();
		}

	}

	record UnitFields(@NotBlank @Size(max = 20) String unitName, @Positive int factorToBase,
			@Pattern(regexp = "^\\d{8,14}$") String gtin) {
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

}
