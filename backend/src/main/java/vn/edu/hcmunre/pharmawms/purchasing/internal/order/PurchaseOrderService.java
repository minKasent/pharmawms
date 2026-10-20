package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.catalog.CatalogApi;
import vn.edu.hcmunre.pharmawms.catalog.ProductSummary;
import vn.edu.hcmunre.pharmawms.iam.UserDirectory;
import vn.edu.hcmunre.pharmawms.inventory.InventoryApi;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptCommand;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptResult;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrder.NewLine;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrder.StatusChange;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.EventView;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.LineView;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.PurchaseOrderSummary;
import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrderViews.PurchaseOrderView;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.Supplier;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierProduct;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierProductRepository;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierRepository;
import vn.edu.hcmunre.pharmawms.purchasing.internal.supplier.SupplierService;
import vn.edu.hcmunre.pharmawms.shared.DocumentCodes;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;
import vn.edu.hcmunre.pharmawms.shared.web.PageResponse;

@Service
public class PurchaseOrderService {

	private static final String CODE_PREFIX = "DMH";

	private final PurchaseOrderRepository orders;
	private final PurchaseOrderEventRepository events;
	private final SupplierService supplierService;
	private final SupplierRepository suppliers;
	private final SupplierProductRepository terms;
	private final CatalogApi catalog;
	private final InventoryApi inventory;
	private final UserDirectory userDirectory;
	private final JdbcClient jdbc;
	private final Clock clock;

	PurchaseOrderService(PurchaseOrderRepository orders, PurchaseOrderEventRepository events,
			SupplierService supplierService, SupplierRepository suppliers, SupplierProductRepository terms,
			CatalogApi catalog, InventoryApi inventory, UserDirectory userDirectory, JdbcClient jdbc, Clock clock) {
		this.orders = orders;
		this.events = events;
		this.supplierService = supplierService;
		this.suppliers = suppliers;
		this.terms = terms;
		this.catalog = catalog;
		this.inventory = inventory;
		this.userDirectory = userDirectory;
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public PageResponse<PurchaseOrderSummary> search(PurchaseOrderStatus status, Long supplierId, int page, int size) {
		var result = orders.search(status, supplierId,
				PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id")));
		List<PurchaseOrder> withLines = orders
			.findWithLinesByIdIn(result.getContent().stream().map(PurchaseOrder::getId).toList());
		Map<Long, PurchaseOrder> byId = withLines.stream()
			.collect(Collectors.toMap(PurchaseOrder::getId, Function.identity()));
		Map<Long, String> supplierNames = supplierNames(
				withLines.stream().map(PurchaseOrder::getSupplierId).collect(Collectors.toSet()));
		Map<Long, String> userNames = userDirectory
			.fullNames(withLines.stream().map(PurchaseOrder::getCreatedBy).collect(Collectors.toSet()));
		return PageResponse.from(result, order -> {
			PurchaseOrder full = byId.get(order.getId());
			return new PurchaseOrderSummary(full.getId(), full.getCode(), full.getSupplierId(),
					supplierNames.get(full.getSupplierId()), full.getStatus(), full.getSource(), full.getCreatedAt(),
					userNames.getOrDefault(full.getCreatedBy(), "#" + full.getCreatedBy()), full.getLines().size(),
					full.totalAmount());
		});
	}

	@Transactional(readOnly = true)
	public PurchaseOrderView view(long id) {
		return toView(find(id));
	}

	@Transactional
	public PurchaseOrderView create(long supplierId, PurchaseOrderSource source, String note, List<LineInput> lines,
			long createdBy) {
		Supplier supplier = supplierService.require(supplierId);
		if (!supplier.isActive()) {
			throw BusinessException.unprocessable("SUPPLIER_INACTIVE", "Nhà cung cấp đã ngừng hợp tác.");
		}
		Instant now = clock.instant();
		var order = new PurchaseOrder(nextCode(), supplierId, source, note, createdBy, now);
		order.replaceLines(resolveLines(supplierId, lines), note);
		orders.save(order);
		recordEvent(order, new StatusChange(null, PurchaseOrderStatus.DRAFT, null), createdBy, now);
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView update(long id, long expectedVersion, String note, List<LineInput> lines) {
		PurchaseOrder order = find(id);
		if (order.getVersion() != expectedVersion) {
			throw BusinessException.conflict("CONCURRENT_UPDATE", "Đơn đã được người khác cập nhật. Vui lòng tải lại.");
		}
		order.replaceLines(resolveLines(order.getSupplierId(), lines), note);
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView submit(long id, long userId) {
		PurchaseOrder order = find(id);
		recordEvent(order, order.submit(clock.instant()), userId, clock.instant());
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView approve(long id, long approverId) {
		PurchaseOrder order = find(id);
		recordEvent(order, order.approve(approverId, clock.instant()), approverId, clock.instant());
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView reject(long id, long userId, String reason) {
		PurchaseOrder order = find(id);
		recordEvent(order, order.reject(reason), userId, clock.instant());
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView markSent(long id, long userId) {
		PurchaseOrder order = find(id);
		recordEvent(order, order.markSent(clock.instant()), userId, clock.instant());
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView cancel(long id, long userId, String reason) {
		PurchaseOrder order = find(id);
		recordEvent(order, order.cancel(reason), userId, clock.instant());
		return toView(order);
	}

	@Transactional
	public PurchaseOrderView closeShort(long id, long userId, String reason) {
		PurchaseOrder order = find(id);
		recordEvent(order, order.closeShort(reason, clock.instant()), userId, clock.instant());
		return toView(order);
	}

	/**
	 * Receives goods against an order. The order row is locked first, then stock is booked
	 * through inventory in the same transaction, then received quantities are applied; an
	 * over-receipt rolls everything back. A replayed idempotency key changes nothing.
	 */
	@Transactional
	public ReceiveResult receive(long id, String idempotencyKey, String note, List<ReceiveLineInput> lines,
			long userId) {
		String normalizedKey = (idempotencyKey == null || idempotencyKey.isBlank()) ? null : idempotencyKey.trim();
		PurchaseOrder order = orders.findForUpdate(id).orElseThrow(() -> notFound(id));
		boolean hasIdempotencyKey = normalizedKey != null;
		boolean canReceiveNew = order.getStatus() == PurchaseOrderStatus.SENT
				|| order.getStatus() == PurchaseOrderStatus.PARTIALLY_RECEIVED;
		if (!canReceiveNew && !(hasIdempotencyKey && order.getStatus() == PurchaseOrderStatus.RECEIVED)) {
			throw BusinessException.unprocessable("INVALID_ORDER_TRANSITION",
					"Chỉ nhận hàng cho đơn đã gửi nhà cung cấp (hiện tại: %s).".formatted(order.getStatus()));
		}
		List<ReceiptCommand.Line> receiptLines = lines.stream().map(line -> {
			var orderLine = order.lineFor(line.productId())
				.orElseThrow(() -> BusinessException.unprocessable("PRODUCT_NOT_IN_ORDER",
						"Thuốc #%d không có trong đơn %s.".formatted(line.productId(), order.getCode())));
			BigDecimal unitCost = line.unitCostPerBaseUnit() != null ? line.unitCostPerBaseUnit()
					: orderLine.getUnitPrice();
			return new ReceiptCommand.Line(line.productId(), line.lotNumber(), line.manufactureDate(),
					line.expiryDate(), line.locationId(), line.unitName(), line.quantity(), unitCost);
		}).toList();

		ReceiptResult receipt = inventory.receive(new ReceiptCommand(normalizedKey, order.getSupplierId(),
				order.getId(), note, userId, receiptLines));
		if (receipt.replayed()) {
			return new ReceiveResult(receipt, toView(order));
		}
		if (!canReceiveNew) {
			throw BusinessException.unprocessable("INVALID_ORDER_TRANSITION",
					"Chỉ nhận hàng cho đơn đã gửi nhà cung cấp (hiện tại: %s).".formatted(order.getStatus()));
		}
		Map<Long, Long> receivedByProduct = receipt.lines()
			.stream()
			.collect(Collectors.groupingBy(ReceiptResult.Line::productId, LinkedHashMap::new,
					Collectors.summingLong(ReceiptResult.Line::baseQuantity)));
		Instant now = clock.instant();
		PurchaseOrderStatus before = order.getStatus();
		var change = order.receive(receivedByProduct, now)
			.orElse(new StatusChange(before, before, null));
		recordEvent(order, new StatusChange(change.from(), change.to(), "Phiếu nhập " + receipt.code()), userId, now);
		return new ReceiveResult(receipt, toView(order));
	}

	private List<NewLine> resolveLines(long supplierId, List<LineInput> lines) {
		Set<Long> productIds = new HashSet<>();
		lines.forEach(line -> productIds.add(line.productId()));
		Map<Long, ProductSummary> products = catalog.getProducts(productIds);
		return lines.stream().map(line -> {
			ProductSummary product = products.get(line.productId());
			if (product == null || !product.active()) {
				throw BusinessException.unprocessable("PRODUCT_NOT_ORDERABLE",
						"Thuốc #%d không tồn tại hoặc đã ngừng kinh doanh.".formatted(line.productId()));
			}
			long baseQuantity = line.unitName() == null ? line.quantity()
					: catalog.toBaseUnits(product, line.unitName(), line.quantity());
			BigDecimal unitPrice = line.unitPrice() != null ? line.unitPrice()
					: terms.findBySupplierIdAndProductId(supplierId, line.productId())
						.map(SupplierProduct::getUnitPrice)
						.orElseThrow(() -> BusinessException.unprocessable("UNIT_PRICE_REQUIRED",
								"Chưa có giá mua của %s từ nhà cung cấp này, cần nhập đơn giá.".formatted(product.sku())));
			return new NewLine(line.productId(), baseQuantity, unitPrice, line.suggestionId());
		}).toList();
	}

	private void recordEvent(PurchaseOrder order, StatusChange change, long userId, Instant now) {
		events.save(new PurchaseOrderEvent(order.getId(), change.from(), change.to(), userId, now, change.note()));
	}

	private String nextCode() {
		long sequence = jdbc.sql("SELECT nextval('purchasing.purchase_order_code_seq')").query(Long.class).single();
		return DocumentCodes.format(CODE_PREFIX, LocalDate.now(clock), sequence);
	}

	private PurchaseOrder find(long id) {
		return orders.findWithLinesById(id).orElseThrow(() -> notFound(id));
	}

	private static BusinessException notFound(long id) {
		return BusinessException.notFound("PURCHASE_ORDER_NOT_FOUND", "Không tìm thấy đơn mua #" + id);
	}

	private Map<Long, String> supplierNames(Set<Long> supplierIds) {
		return suppliers.findAllById(supplierIds)
			.stream()
			.collect(Collectors.toMap(Supplier::getId, Supplier::getName));
	}

	private PurchaseOrderView toView(PurchaseOrder order) {
		// The optimistic-lock version is only incremented on flush; clients need the new value.
		orders.flush();
		Map<Long, ProductSummary> products = catalog
			.getProducts(order.getLines().stream().map(PurchaseOrderLine::getProductId).collect(Collectors.toSet()));
		List<PurchaseOrderEvent> history = order.getId() == null ? List.of()
				: events.findByPurchaseOrderIdOrderByOccurredAtAscIdAsc(order.getId());
		Set<Long> userIds = new HashSet<>();
		userIds.add(order.getCreatedBy());
		if (order.getApprovedBy() != null) {
			userIds.add(order.getApprovedBy());
		}
		history.forEach(event -> userIds.add(event.getPerformedBy()));
		Map<Long, String> names = userDirectory.fullNames(userIds);

		List<LineView> lines = order.getLines().stream().map(line -> {
			ProductSummary product = products.get(line.getProductId());
			return new LineView(line.getProductId(), product.sku(), product.displayName(), product.baseUnit(),
					line.getQuantity(), line.getReceivedQuantity(), line.remainingQuantity(), line.getUnitPrice(),
					line.lineTotal(), line.getSuggestionId());
		}).toList();
		List<EventView> eventViews = history.stream()
			.map(event -> new EventView(event.getFromStatus(), event.getToStatus(),
					names.getOrDefault(event.getPerformedBy(), "#" + event.getPerformedBy()), event.getOccurredAt(),
					event.getNote()))
			.toList();
		String supplierName = suppliers.findById(order.getSupplierId()).map(Supplier::getName).orElse(null);
		return new PurchaseOrderView(order.getId(), order.getCode(), order.getSupplierId(), supplierName,
				order.getStatus(), order.getSource(), order.getNote(), order.getCreatedBy(),
				names.getOrDefault(order.getCreatedBy(), "#" + order.getCreatedBy()), order.getCreatedAt(),
				order.getSubmittedAt(),
				order.getApprovedBy() == null ? null
						: names.getOrDefault(order.getApprovedBy(), "#" + order.getApprovedBy()),
				order.getApprovedAt(),
				order.getRejectionReason(), order.getSentAt(), order.getFirstReceivedAt(), order.getCompletedAt(),
				order.getVersion(), order.totalAmount(), lines, eventViews);
	}

	/**
	 * @param unitName {@code null} means the quantity is already in base units
	 * @param unitPrice {@code null} means "use the supplier's agreed price"
	 */
	public record LineInput(long productId, String unitName, long quantity, BigDecimal unitPrice, Long suggestionId) {
	}

	public record ReceiveLineInput(long productId, String lotNumber, LocalDate manufactureDate, LocalDate expiryDate,
			long locationId, String unitName, long quantity, BigDecimal unitCostPerBaseUnit) {
	}

	public record ReceiveResult(ReceiptResult receipt, PurchaseOrderView order) {
	}

}
