package vn.edu.hcmunre.pharmawms.catalog.internal.application;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Category;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product.UnitDefinition;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.ProductDetails;
import vn.edu.hcmunre.pharmawms.catalog.internal.persistence.CategoryRepository;
import vn.edu.hcmunre.pharmawms.catalog.internal.persistence.ProductRepository;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Service
public class ProductService {

	private final ProductRepository products;
	private final CategoryRepository categories;
	private final Clock clock;

	ProductService(ProductRepository products, CategoryRepository categories, Clock clock) {
		this.products = products;
		this.categories = categories;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public PageResponse<ProductListItem> search(String search, Long categoryId, Boolean active, Pageable pageable) {
		String normalized = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
		String pattern = "%" + escapeLike(normalized) + "%";
		return PageResponse.from(products.search(pattern, categoryId, active, pageable), ProductMapper::toListItem);
	}

	@Transactional(readOnly = true)
	public ProductDetailView get(long id) {
		return ProductMapper.toDetail(find(id));
	}

	@Transactional
	public ProductDetailView create(String sku, ProductDetails details, long categoryId, List<UnitDefinition> units) {
		String normalizedSku = sku.trim().toUpperCase(Locale.ROOT);
		if (products.existsBySkuIgnoreCase(normalizedSku)) {
			throw BusinessException.conflict("SKU_TAKEN", "Mã thuốc '%s' đã tồn tại.".formatted(normalizedSku));
		}
		validateUnits(details.baseUnit(), units);
		var product = new Product(normalizedSku, details, findCategory(categoryId), clock.instant());
		product.replaceUnits(units);
		return ProductMapper.toDetail(products.save(product));
	}

	@Transactional
	@CacheEvict(cacheNames = CatalogApi.PRODUCT_CACHE, key = "#id")
	public ProductDetailView update(long id, long expectedVersion, ProductDetails details, long categoryId,
			List<UnitDefinition> units) {
		var product = find(id);
		if (product.getVersion() != expectedVersion) {
			throw BusinessException.conflict("CONCURRENT_UPDATE",
					"Thuốc đã được người khác cập nhật. Vui lòng tải lại trang.");
		}
		if (!product.getBaseUnit().equals(details.baseUnit())) {
			throw BusinessException.unprocessable("BASE_UNIT_IMMUTABLE",
					"Không thể đổi đơn vị cơ sở vì tồn kho và lịch sử đều tính theo đơn vị này.");
		}
		validateUnits(details.baseUnit(), units);
		product.update(details, findCategory(categoryId), clock.instant());
		product.replaceUnits(units);
		return ProductMapper.toDetail(product);
	}

	@Transactional
	@CacheEvict(cacheNames = CatalogApi.PRODUCT_CACHE, key = "#id")
	public void setActive(long id, boolean active) {
		find(id).setActive(active, clock.instant());
	}

	private static void validateUnits(String baseUnit, List<UnitDefinition> units) {
		var names = new HashSet<String>();
		for (UnitDefinition unit : units) {
			if (!names.add(unit.unitName())) {
				throw BusinessException.unprocessable("DUPLICATE_UNIT",
						"Đơn vị '%s' bị khai báo trùng.".formatted(unit.unitName()));
			}
			if (unit.unitName().equals(baseUnit)) {
				if (unit.factorToBase() != 1) {
					throw BusinessException.unprocessable("INVALID_UNIT_FACTOR",
							"Đơn vị cơ sở '%s' phải có hệ số quy đổi bằng 1.".formatted(baseUnit));
				}
			}
			else if (unit.factorToBase() <= 1) {
				throw BusinessException.unprocessable("INVALID_UNIT_FACTOR",
						"Đơn vị '%s' phải quy đổi lớn hơn 1 %s.".formatted(unit.unitName(), baseUnit));
			}
		}
	}

	private Product find(long id) {
		return products.findWithDetailsById(id)
			.orElseThrow(() -> BusinessException.notFound("PRODUCT_NOT_FOUND", "Không tìm thấy thuốc #" + id));
	}

	private Category findCategory(long id) {
		return categories.findById(id)
			.orElseThrow(() -> BusinessException.unprocessable("CATEGORY_NOT_FOUND", "Nhóm thuốc #%d không tồn tại."
				.formatted(id)));
	}

	private static String escapeLike(String value) {
		return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

}
