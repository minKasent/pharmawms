package vn.edu.hcmunre.pharmawms.purchasing.internal.supplier;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

	boolean existsByCodeIgnoreCase(String code);

}
