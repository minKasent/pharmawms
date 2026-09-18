package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import org.springframework.data.jpa.repository.JpaRepository;

interface WarehouseRepository extends JpaRepository<Warehouse, Long> {

	boolean existsByCodeIgnoreCase(String code);

}
