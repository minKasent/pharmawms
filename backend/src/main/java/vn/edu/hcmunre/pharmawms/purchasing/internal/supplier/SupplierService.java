package vn.edu.hcmunre.pharmawms.purchasing.internal.supplier;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.Supplier.SupplierDetails;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class SupplierService {

	private final SupplierRepository suppliers;
	private final SupplierProductRepository terms;
	private final CatalogApi catalog;

	SupplierService(SupplierRepository suppliers, SupplierProductRepository terms, CatalogApi catalog) {
		this.suppliers = suppliers;
		this.terms = terms;
		this.catalog = catalog;
	}

	@Transactional(readOnly = true)
	public List<SupplierView> list() {
		return suppliers.findAll(Sort.by("code")).stream().map(SupplierService::toView).toList();
	}

	@Transactional(readOnly = true)
	public SupplierView get(long supplierId) {
		return toView(require(supplierId));
	}

	@Transactional(readOnly = true)
	public Supplier require(long supplierId) {
		return suppliers.findById(supplierId)
			.orElseThrow(() -> BusinessException.notFound("SUPPLIER_NOT_FOUND",
					"Không tìm thấy nhà cung cấp #" + supplierId));
	}

	@Transactional
	public SupplierView create(String code, SupplierDetails details) {
		String normalized = code.trim().toUpperCase(Locale.ROOT);
		if (suppliers.existsByCodeIgnoreCase(normalized)) {
			throw BusinessException.conflict("SUPPLIER_CODE_TAKEN",
					"Mã nhà cung cấp '%s' đã tồn tại.".formatted(normalized));
		}
		return toView(suppliers.save(new Supplier(normalized, details)));
	}

	@Transactional
	public SupplierView update(long id, SupplierDetails details, boolean active) {
		Supplier supplier = require(id);
		supplier.update(details);
		supplier.setActive(active);
		return toView(supplier);
	}

	@Transactional(readOnly = true)
	public List<TermsView> termsOf(long supplierId) {
		require(supplierId);
		List<SupplierProduct> rows = terms.findBySupplierIdOrderByProductId(supplierId);
		Map<Long, ProductSummary> products = catalog
			.getProducts(rows.stream().map(SupplierProduct::getProductId).collect(Collectors.toSet()));
		return rows.stream().map(row -> toTermsView(row, products.get(row.getProductId()))).toList();
	}

	/**
	 * Creates or updates terms. Marking a supplier preferred un-marks the previous preferred
	 * supplier of that product (one preferred supplier per product is enforced by a unique index).
	 */
	@Transactional
	public TermsView upsertTerms(long supplierId, long productId, long packSize, long minOrderQuantity,
			BigDecimal unitPrice, boolean preferred) {
		require(supplierId);
		ProductSummary product = catalog.getProduct(productId);
		if (preferred) {
			terms.clearPreferred(productId, supplierId);
		}
		SupplierProduct row = terms.findBySupplierIdAndProductId(supplierId, productId)
			.orElseGet(() -> new SupplierProduct(supplierId, productId));
		row.updateTerms(packSize, minOrderQuantity, unitPrice, preferred);
		return toTermsView(terms.save(row), product);
	}

	@Transactional
	public void deleteTerms(long supplierId, long productId) {
		require(supplierId);
		terms.findBySupplierIdAndProductId(supplierId, productId).ifPresent(terms::delete);
	}

	private static SupplierView toView(Supplier supplier) {
		return new SupplierView(supplier.getId(), supplier.getCode(), supplier.getName(), supplier.getPhone(),
				supplier.getEmail(), supplier.getAddress(), supplier.getDefaultLeadTimeDays(), supplier.isActive());
	}

	private static TermsView toTermsView(SupplierProduct row, ProductSummary product) {
		return new TermsView(row.getSupplierId(), row.getProductId(), product.sku(), product.displayName(),
				product.baseUnit(), row.getPackSize(), row.getMinOrderQuantity(), row.getUnitPrice(), row.isPreferred());
	}

	public record SupplierView(long id, String code, String name, String phone, String email, String address,
			int defaultLeadTimeDays, boolean active) {
	}

	public record TermsView(long supplierId, long productId, String sku, String productName, String baseUnit,
			long packSize, long minOrderQuantity, BigDecimal unitPrice, boolean preferred) {
	}

}
