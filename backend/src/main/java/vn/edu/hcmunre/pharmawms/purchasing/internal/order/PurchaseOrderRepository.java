package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

	@EntityGraph(attributePaths = "lines")
	Optional<PurchaseOrder> findWithLinesById(long id);

	/**
	 * Serialises concurrent receipts against the same order so over-receipt cannot slip through.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select po from PurchaseOrder po where po.id = :id")
	Optional<PurchaseOrder> findForUpdate(long id);

	@Query("""
			select po from PurchaseOrder po
			where (:status is null or po.status = :status)
			  and (:supplierId is null or po.supplierId = :supplierId)
			""")
	Page<PurchaseOrder> search(PurchaseOrderStatus status, Long supplierId, Pageable pageable);

	@EntityGraph(attributePaths = "lines")
	List<PurchaseOrder> findWithLinesByIdIn(Collection<Long> ids);

}
