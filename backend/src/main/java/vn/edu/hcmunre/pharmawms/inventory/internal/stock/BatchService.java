package vn.edu.hcmunre.pharmawms.inventory.internal.stock;

import java.time.Clock;
import java.time.LocalDate;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * Quality status changes of a batch (e.g. a recall notice from the authority puts a lot on hold).
 */
@Service
public class BatchService {

	private final JdbcClient jdbc;
	private final Clock clock;

	BatchService(JdbcClient jdbc, Clock clock) {
		this.jdbc = jdbc;
		this.clock = clock;
	}

	@Transactional
	public void hold(long batchId, String reason) {
		int updated = jdbc.sql("""
				UPDATE inventory.batch SET status = 'ON_HOLD', hold_reason = :reason, version = version + 1
				WHERE id = :id AND status IN ('AVAILABLE', 'QUARANTINE')
				""")
			.param("id", batchId)
			.param("reason", reason)
			.update();
		requireTransition(batchId, updated, "khóa (tạm ngừng xuất)", null);
	}

	@Transactional
	public void release(long batchId) {
		LocalDate today = LocalDate.now(clock);
		int updated = jdbc.sql("""
				UPDATE inventory.batch SET status = 'AVAILABLE', hold_reason = NULL, version = version + 1
				WHERE id = :id AND status IN ('ON_HOLD', 'QUARANTINE') AND expiry_date > :today
				""")
			.param("id", batchId)
			.param("today", today)
			.update();
		requireTransition(batchId, updated, "mở khóa", today);
	}

	private void requireTransition(long batchId, int updated, String action, LocalDate releaseDate) {
		if (updated == 1) {
			return;
		}
		BatchState state = jdbc.sql("SELECT status, expiry_date FROM inventory.batch WHERE id = :id")
			.param("id", batchId)
			.query(BatchState.class)
			.optional()
			.orElseThrow(() -> BusinessException.notFound("BATCH_NOT_FOUND", "Không tìm thấy lô #" + batchId));
		if (releaseDate != null && ("EXPIRED".equals(state.status())
				|| (("ON_HOLD".equals(state.status()) || "QUARANTINE".equals(state.status()))
						&& !state.expiryDate().isAfter(releaseDate)))) {
			throw BusinessException.unprocessable("BATCH_EXPIRED", "Không thể mở khóa lô đã hết hạn.");
		}
		throw BusinessException.unprocessable("INVALID_BATCH_TRANSITION",
				"Không thể %s lô đang ở trạng thái %s.".formatted(action, state.status()));
	}

	private record BatchState(String status, LocalDate expiryDate) {
	}

}
