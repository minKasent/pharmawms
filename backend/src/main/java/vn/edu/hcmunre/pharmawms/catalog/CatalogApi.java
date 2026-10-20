package vn.edu.hcmunre.pharmawms.catalog;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.internal.persistence.ProductRepository;
import vn.edu.hcmunre.pharmawms.catalog.internal.application.ProductMapper;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * The only entry point other modules use to read the catalog.
 */
@Service
@Transactional(readOnly = true)
public class CatalogApi {

	public static final String PRODUCT_CACHE = "catalog.product";

	private final ProductRepository products;

	public CatalogApi(ProductRepository products) {
		this.products = products;
	}

	@Cacheable(cacheNames = PRODUCT_CACHE, key = "#productId")
	public ProductSummary getProduct(long productId) {
		return products.findWithDetailsById(productId)
			.map(ProductMapper::toSummary)
			.orElseThrow(() -> BusinessException.notFound("PRODUCT_NOT_FOUND",
					"Không tìm thấy thuốc #" + productId));
	}

	public Map<Long, ProductSummary> getProducts(Collection<Long> productIds) {
		if (productIds.isEmpty()) {
			return Map.of();
		}
		return products.findAllWithDetailsByIdIn(productIds)
			.stream()
			.map(ProductMapper::toSummary)
			.collect(Collectors.toMap(ProductSummary::id, Function.identity()));
	}

	public List<ProductSummary> activeProducts() {
		return products.findAllActiveWithDetails().stream().map(ProductMapper::toSummary).toList();
	}

	/**
	 * Converts a quantity in a packaging unit (e.g. "Hộp") into base units (e.g. "Viên").
	 */
	public long toBaseUnits(ProductSummary product, String unitName, long quantity) {
		Integer factor = product.unitFactors().get(unitName);
		if (factor == null) {
			throw BusinessException.unprocessable("UNKNOWN_UNIT",
					"Đơn vị '%s' không thuộc thuốc %s.".formatted(unitName, product.sku()));
		}
		try {
			return Math.multiplyExact(quantity, factor.longValue());
		}
		catch (ArithmeticException exception) {
			throw BusinessException.unprocessable("QUANTITY_TOO_LARGE", "Số lượng quá lớn.");
		}
	}

}
