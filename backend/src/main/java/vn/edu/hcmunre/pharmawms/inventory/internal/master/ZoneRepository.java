package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import org.springframework.data.jpa.repository.JpaRepository;

interface ZoneRepository extends JpaRepository<Zone, Long> {

	boolean existsByWarehouseIdAndCodeIgnoreCase(long warehouseId, String code);

}
