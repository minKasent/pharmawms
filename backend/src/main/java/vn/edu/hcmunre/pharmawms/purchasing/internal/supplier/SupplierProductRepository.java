package vn.edu.hcmunre.pharmawms.purchasing.internal.supplier;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface SupplierProductRepository extends JpaRepository<SupplierProduct, Long> {

	Optional<SupplierProduct> findBySupplierIdAndProductId(long supplierId, long productId);

	List<SupplierProduct> findBySupplierIdOrderByProductId(long supplierId);

	List<SupplierProduct> findByProductId(long productId);

	@Modifying(flushAutomatically = true)
	@Query("update SupplierProduct sp set sp.preferred = false where sp.productId = :productId and sp.supplierId <> :supplierId")
	int clearPreferred(long productId, long supplierId);

}
