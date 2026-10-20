package vn.edu.hcmunre.pharmawms.catalog.internal.application;

import java.util.List;
import java.util.Locale;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Category;
import vn.edu.hcmunre.pharmawms.catalog.internal.persistence.CategoryRepository;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class CategoryService {

	private final CategoryRepository categories;

	CategoryService(CategoryRepository categories) {
		this.categories = categories;
	}

	@Transactional(readOnly = true)
	public List<CategoryView> list() {
		return categories.findAll(Sort.by("name")).stream().map(CategoryService::toView).toList();
	}

	@Transactional
	public CategoryView create(String code, String name) {
		String normalizedCode = code.trim().toUpperCase(Locale.ROOT);
		if (categories.existsByCodeIgnoreCase(normalizedCode)) {
			throw BusinessException.conflict("CATEGORY_CODE_TAKEN",
					"Mã nhóm '%s' đã tồn tại.".formatted(normalizedCode));
		}
		return toView(categories.save(new Category(normalizedCode, name.trim())));
	}

	@Transactional
	@CacheEvict(cacheNames = CatalogApi.PRODUCT_CACHE, allEntries = true)
	public CategoryView rename(long id, String name) {
		var category = categories.findById(id)
			.orElseThrow(() -> BusinessException.notFound("CATEGORY_NOT_FOUND", "Không tìm thấy nhóm thuốc #" + id));
		category.rename(name.trim());
		return toView(category);
	}

	private static CategoryView toView(Category category) {
		return new CategoryView(category.getId(), category.getCode(), category.getName());
	}

	public record CategoryView(long id, String code, String name) {
	}

}
