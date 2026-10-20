package vn.edu.hcmunre.pharmawms.catalog.internal.web;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
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

import vn.edu.hcmunre.pharmawms.catalog.internal.application.CategoryService;
import vn.edu.hcmunre.pharmawms.catalog.internal.application.CategoryService.CategoryView;

@Tag(name = "Catalog")
@RestController
@RequestMapping("/api/v1/categories")
class CategoryController {

	private final CategoryService categoryService;

	CategoryController(CategoryService categoryService) {
		this.categoryService = categoryService;
	}

	@GetMapping
	@PreAuthorize("hasAuthority('CATALOG_READ')")
	List<CategoryView> list() {
		return categoryService.list();
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('CATALOG_MANAGE')")
	CategoryView create(@Valid @RequestBody CreateCategoryRequest request) {
		return categoryService.create(request.code(), request.name());
	}

	@PutMapping("/{id}")
	@PreAuthorize("hasAuthority('CATALOG_MANAGE')")
	CategoryView rename(@PathVariable long id, @Valid @RequestBody RenameCategoryRequest request) {
		return categoryService.rename(id, request.name());
	}

	record CreateCategoryRequest(@NotBlank @Size(max = 30) @Pattern(regexp = "^[A-Za-z0-9_-]+$") String code,
			@NotBlank @Size(max = 100) String name) {
	}

	record RenameCategoryRequest(@NotBlank @Size(max = 100) String name) {
	}

}
