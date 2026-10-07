package vn.edu.hcmunre.pharmawms.purchasing.internal.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import vn.edu.hcmunre.pharmawms.purchasing.internal.order.PurchaseOrder.NewLine;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PurchaseOrderTest {

	private static final long CREATOR = 10;
	private static final long APPROVER = 20;
	private static final long PARACETAMOL = 1;
	private static final long AMOXICILLIN = 2;
	private static final Instant NOW = Instant.parse("2026-10-01T03:00:00Z");

	private static PurchaseOrder draft() {
		PurchaseOrder order = new PurchaseOrder("DMH-1", 5, PurchaseOrderSource.MANUAL, null, CREATOR, NOW);
		order.replaceLines(List.of(new NewLine(PARACETAMOL, 100, BigDecimal.TEN, null),
				new NewLine(AMOXICILLIN, 50, BigDecimal.ONE, null)), null);
		return order;
	}

	private static PurchaseOrder sent() {
		PurchaseOrder order = draft();
		order.submit(NOW);
		order.approve(APPROVER, NOW);
		order.markSent(NOW);
		return order;
	}

	private static void assertRejected(Runnable action, String code) {
		assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
				exception -> assertThat(exception.getCode()).isEqualTo(code));
	}

	@Test
	void happyPathReachesReceived() {
		PurchaseOrder order = sent();

		assertThat(order.receive(Map.of(PARACETAMOL, 100L, AMOXICILLIN, 50L), NOW)).isPresent();
		assertThat(order.getStatus()).isEqualTo(PurchaseOrderStatus.RECEIVED);
		assertThat(order.getCompletedAt()).isEqualTo(NOW);
	}

	@Test
	void creatorCannotApproveOwnOrder() {
		PurchaseOrder order = draft();
		order.submit(NOW);

		assertRejected(() -> order.approve(CREATOR, NOW), "SEGREGATION_OF_DUTIES");
		assertThat(order.getStatus()).isEqualTo(PurchaseOrderStatus.PENDING_APPROVAL);
	}

	@Test
	void rejectionReturnsToDraftWithReason() {
		PurchaseOrder order = draft();
		order.submit(NOW);
		order.reject("Giá cao");

		assertThat(order.getStatus()).isEqualTo(PurchaseOrderStatus.DRAFT);
		assertThat(order.getRejectionReason()).isEqualTo("Giá cao");
	}

	@Test
	void emptyOrderCannotBeSubmitted() {
		PurchaseOrder order = new PurchaseOrder("DMH-2", 5, PurchaseOrderSource.MANUAL, null, CREATOR, NOW);

		assertRejected(() -> order.submit(NOW), "EMPTY_DOCUMENT");
	}

	@Test
	void linesCanOnlyChangeWhileDraft() {
		PurchaseOrder order = draft();
		order.submit(NOW);

		assertRejected(() -> order.replaceLines(List.of(new NewLine(PARACETAMOL, 1, BigDecimal.ONE, null)), null),
				"INVALID_ORDER_TRANSITION");
	}

	@Test
	void duplicateProductLinesAreRejected() {
		PurchaseOrder order = new PurchaseOrder("DMH-3", 5, PurchaseOrderSource.MANUAL, null, CREATOR, NOW);

		assertRejected(() -> order.replaceLines(List.of(new NewLine(PARACETAMOL, 1, BigDecimal.ONE, null),
				new NewLine(PARACETAMOL, 2, BigDecimal.ONE, null)), null), "DUPLICATE_PRODUCT_LINE");
	}

	@Test
	void replacingLinesMergesByProduct() {
		PurchaseOrder order = draft();
		order.replaceLines(List.of(new NewLine(PARACETAMOL, 300, BigDecimal.TEN, null)), "sửa");

		assertThat(order.getLines()).singleElement().satisfies(line -> {
			assertThat(line.getProductId()).isEqualTo(PARACETAMOL);
			assertThat(line.getQuantity()).isEqualTo(300);
		});
	}

	@Test
	void editingQuantityKeepsTheSuggestionLink() {
		long suggestionId = 77;
		PurchaseOrder order = new PurchaseOrder("DMH-4", 5, PurchaseOrderSource.SUGGESTION, null, CREATOR, NOW);
		order.replaceLines(List.of(new NewLine(PARACETAMOL, 100, BigDecimal.TEN, suggestionId)), null);

		order.replaceLines(List.of(new NewLine(PARACETAMOL, 120, BigDecimal.TEN, null)), "tăng số lượng");

		assertThat(order.getLines()).singleElement().satisfies(line -> {
			assertThat(line.getQuantity()).isEqualTo(120);
			assertThat(line.getSuggestionId()).isEqualTo(suggestionId);
		});
	}

	@Test
	void cannotSendBeforeApproval() {
		PurchaseOrder order = draft();
		order.submit(NOW);

		assertRejected(() -> order.markSent(NOW), "INVALID_ORDER_TRANSITION");
	}

	@Test
	void partialReceiptThenCloseShort() {
		PurchaseOrder order = sent();
		order.receive(Map.of(PARACETAMOL, 40L), NOW);

		assertThat(order.getStatus()).isEqualTo(PurchaseOrderStatus.PARTIALLY_RECEIVED);
		assertThat(order.lineFor(PARACETAMOL).orElseThrow().remainingQuantity()).isEqualTo(60);
		assertThat(order.getFirstReceivedAt()).isEqualTo(NOW);

		order.closeShort("NCC hết hàng", NOW);
		assertThat(order.getStatus()).isEqualTo(PurchaseOrderStatus.RECEIVED);
	}

	@Test
	void secondPartialReceiptKeepsStatusWithoutTransition() {
		PurchaseOrder order = sent();
		order.receive(Map.of(PARACETAMOL, 40L), NOW);

		assertThat(order.receive(Map.of(PARACETAMOL, 10L), NOW)).isEmpty();
		assertThat(order.getStatus()).isEqualTo(PurchaseOrderStatus.PARTIALLY_RECEIVED);
	}

	@Test
	void overReceiptIsRejected() {
		PurchaseOrder order = sent();

		assertRejected(() -> order.receive(Map.of(PARACETAMOL, 101L), NOW), "OVER_RECEIPT");
	}

	@Test
	void productOutsideOrderCannotBeReceived() {
		PurchaseOrder order = sent();

		assertRejected(() -> order.receive(Map.of(99L, 1L), NOW), "PRODUCT_NOT_IN_ORDER");
	}

	@Test
	void cannotReceiveBeforeSent() {
		PurchaseOrder order = draft();

		assertRejected(() -> order.receive(Map.of(PARACETAMOL, 1L), NOW), "INVALID_ORDER_TRANSITION");
	}

	@Test
	void sentOrderCanBeCancelledOnlyWhileNothingReceived() {
		PurchaseOrder untouched = sent();
		untouched.cancel("Đổi NCC");
		assertThat(untouched.getStatus()).isEqualTo(PurchaseOrderStatus.CANCELLED);

		PurchaseOrder started = sent();
		started.receive(Map.of(PARACETAMOL, 1L), NOW);
		assertRejected(() -> started.cancel("Đổi NCC"), "INVALID_ORDER_TRANSITION");
	}

	@Test
	void receivedOrderIsFinal() {
		PurchaseOrder order = sent();
		order.receive(Map.of(PARACETAMOL, 100L, AMOXICILLIN, 50L), NOW);

		assertRejected(() -> order.cancel("x"), "INVALID_ORDER_TRANSITION");
		assertRejected(() -> order.receive(Map.of(PARACETAMOL, 1L), NOW), "INVALID_ORDER_TRANSITION");
	}

}
