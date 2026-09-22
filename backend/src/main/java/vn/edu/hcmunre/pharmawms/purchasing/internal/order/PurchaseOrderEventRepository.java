package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface PurchaseOrderEventRepository extends JpaRepository<PurchaseOrderEvent, Long> {

	List<PurchaseOrderEvent> findByPurchaseOrderIdOrderByOccurredAtAscIdAsc(long purchaseOrderId);

}
