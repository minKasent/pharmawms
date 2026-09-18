package vn.edu.hcmunre.pharmawms.inventory.internal.master;

import org.springframework.data.jpa.repository.JpaRepository;

interface LocationRepository extends JpaRepository<Location, Long> {

	boolean existsByZoneIdAndCodeIgnoreCase(long zoneId, String code);

}
