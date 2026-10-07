package vn.edu.hcmunre.pharmawms.catalog.internal.application;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.catalog.StorageCondition;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Category;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product.UnitDefinition;
import vn.edu.hcmunre.pharmawms.catalog.internal.domain.ProductDetails;
import vn.edu.hcmunre.pharmawms.catalog.internal.persistence.CategoryRepository;
import vn.edu.hcmunre.pharmawms.catalog.internal.persistence.ProductRepository;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CatalogServiceTest {

	private static final Instant NOW = Instant.parse("2026-10-19T12:00:00Z");
	private static final Clock CLOCK = Clock.fixed(NOW, ZoneOffset.UTC);

	private ProductRepository productRepository;
	private CategoryRepository categoryRepository;
	private ProductService productService;
	private CategoryService categoryService;
	private CatalogApi catalogApi;

	@BeforeEach
	void setUp() {
		productRepository = mock(ProductRepository.class);
		categoryRepository = mock(CategoryRepository.class);
		productService = new ProductService(productRepository, categoryRepository, CLOCK);
		categoryService = new CategoryService(categoryRepository);
		catalogApi = new CatalogApi(productRepository);
	}

	@Test
	void convertsPackagingUnitToBaseUnitsAndRejectsUnknownOrOverflow() {
		ProductSummary summary = new ProductSummary(1L, "PARA-500", "Paracetamol", "Paracetamol", "500mg", "Viên nén",
				"Kháng đau", "Viên", Map.of("Viên", 1, "Vỉ", 10, "Hộp", 100), StorageCondition.NORMAL, 180, false,
				BigDecimal.TEN, true);

		assertThat(catalogApi.toBaseUnits(summary, "Viên", 15)).isEqualTo(15);
		assertThat(catalogApi.toBaseUnits(summary, "Hộp", 3)).isEqualTo(300);

		assertThatThrownBy(() -> catalogApi.toBaseUnits(summary, "Thùng", 1))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("UNKNOWN_UNIT"));

		assertThatThrownBy(() -> catalogApi.toBaseUnits(summary, "Hộp", Long.MAX_VALUE))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("QUANTITY_TOO_LARGE"));
	}

	@Test
	void rejectsDuplicateOrInvalidFactorPackagingUnitsAndPreservesBaseUnitGtin() {
		ProductDetails details = new ProductDetails("Paracetamol", "Paracetamol", "500mg", "Viên nén", null, null, null,
				StorageCondition.NORMAL, false, "Viên", 180, BigDecimal.TEN);

		assertThatThrownBy(() -> productService.create("PARA-500", details, 1L,
				List.of(new UnitDefinition("Hộp", 100, null), new UnitDefinition("Hộp", 200, null))))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("DUPLICATE_UNIT"));

		assertThatThrownBy(() -> productService.create("PARA-500", details, 1L,
				List.of(new UnitDefinition("Viên", 1, null), new UnitDefinition("Viên", 1, "8930001"))))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("DUPLICATE_UNIT"));

		assertThatThrownBy(() -> productService.create("PARA-500", details, 1L,
				List.of(new UnitDefinition("Viên", 2, null))))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("INVALID_UNIT_FACTOR"));

		assertThatThrownBy(() -> productService.create("PARA-500", details, 1L,
				List.of(new UnitDefinition("Hộp", 1, null))))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("INVALID_UNIT_FACTOR"));

		Category cat = new Category("KS", "Kháng sinh");
		org.springframework.test.util.ReflectionTestUtils.setField(cat, "id", 1L);
		when(categoryRepository.findById(1L)).thenReturn(Optional.of(cat));
		when(productRepository.save(any())).thenAnswer(inv -> {
			var p = inv.getArgument(0, vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product.class);
			org.springframework.test.util.ReflectionTestUtils.setField(p, "id", 99L);
			return p;
		});

		var detail = productService.create("PARA-500", details, 1L,
				List.of(new UnitDefinition("Viên", 1, "8931234567890"), new UnitDefinition("Hộp", 100, "8931234567899")));
		assertThat(detail.units()).anySatisfy(u -> {
			assertThat(u.unitName()).isEqualTo("Viên");
			assertThat(u.factorToBase()).isEqualTo(1);
			assertThat(u.gtin()).isEqualTo("8931234567890");
		});
	}

	@Test
	void createsAndRenamesCategoryAndRejectsDuplicateCode() {
		when(categoryRepository.existsByCodeIgnoreCase("KS")).thenReturn(false);
		when(categoryRepository.save(any(Category.class))).thenAnswer(inv -> {
			Category cat = inv.getArgument(0);
			org.springframework.test.util.ReflectionTestUtils.setField(cat, "id", 10L);
			return cat;
		});

		var created = categoryService.create(" ks ", " Kháng sinh ");
		assertThat(created.id()).isEqualTo(10L);
		assertThat(created.code()).isEqualTo("KS");
		assertThat(created.name()).isEqualTo("Kháng sinh");

		when(categoryRepository.existsByCodeIgnoreCase("KS")).thenReturn(true);
		assertThatThrownBy(() -> categoryService.create("ks", "Kháng sinh"))
			.isInstanceOfSatisfying(BusinessException.class,
					ex -> assertThat(ex.getCode()).isEqualTo("CATEGORY_CODE_TAKEN"));

		Category existing = new Category("KS", "Kháng sinh");
		org.springframework.test.util.ReflectionTestUtils.setField(existing, "id", 10L);
		when(categoryRepository.findById(10L)).thenReturn(Optional.of(existing));
		var renamed = categoryService.rename(10L, " Kháng sinh tổng hợp ");
		assertThat(renamed.name()).isEqualTo("Kháng sinh tổng hợp");
	}

}
