package vn.edu.hcmunre.pharmawms.inventory.internal.issuing;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import vn.edu.hcmunre.pharmawms.TestcontainersConfiguration;
import vn.edu.hcmunre.pharmawms.inventory.InventoryApi;
import vn.edu.hcmunre.pharmawms.inventory.ReceiptCommand;
import vn.edu.hcmunre.pharmawms.inventory.internal.issuing.IssueViews.IssueView;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs many goods issues at once against a real PostgreSQL to prove the locking strategy: stock
 * never goes negative, FEFO holds under contention, no deadlocks, and the ledger always matches
 * the balances.
 */
@SpringBootTest(properties = { "pharmawms.forecasting.enabled=false", "pharmawms.demo.enabled=false" })
@Import(TestcontainersConfiguration.class)
class ConcurrentIssuingTest {

	private static final int THREADS = 32;
	private static final int MIN_REMAINING_DAYS = 1;
	private static final long USER = 1;
	private static final String BASE_UNIT = "Viên";

	@Autowired
	private IssuingService issuing;

	@Autowired
	private InventoryApi inventory;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private Clock clock;

	@Test
	void hundredConcurrentIssuesNeverOversell() throws Exception {
		long product = newProduct();
		long location = newLocation();
		receive(product, location, Map.of("A", 100, "B", 200, "C", 300), Map.of("A", 30L, "B", 30L, "C", 20L));

		Map<String, AtomicInteger> outcomes = new ConcurrentHashMap<>();
		runConcurrently(100, i -> {
			try {
				issuing.issue(issueOne(product, null));
				outcomes.computeIfAbsent("OK", k -> new AtomicInteger()).incrementAndGet();
			}
			catch (BusinessException exception) {
				outcomes.computeIfAbsent(exception.getCode(), k -> new AtomicInteger()).incrementAndGet();
			}
			return null;
		});

		assertThat(outcomes.keySet()).containsExactlyInAnyOrder("OK", "INSUFFICIENT_STOCK");
		assertThat(outcomes.get("OK").get()).isEqualTo(80);
		assertThat(onHand(product)).isZero();
		assertLedgerMatchesBalances(product);
	}

	@Test
	void concurrentIssuesStillFollowFefo() throws Exception {
		long product = newProduct();
		long location = newLocation();
		receive(product, location, Map.of("EARLY", 100, "LATE", 300), Map.of("EARLY", 30L, "LATE", 30L));

		runConcurrently(40, i -> issuing.issue(issueOne(product, null)));

		assertThat(onHandByLot(product)).containsExactlyInAnyOrderEntriesOf(Map.of("EARLY", 0L, "LATE", 20L));
		assertLedgerMatchesBalances(product);
	}

	@Test
	void concurrentRetriesWithSameIdempotencyKeyBookOnce() throws Exception {
		long product = newProduct();
		long location = newLocation();
		receive(product, location, Map.of("A", 100), Map.of("A", 50L));
		String key = UUID.randomUUID().toString();

		List<IssueView> results = runConcurrently(20, i -> issuing.issue(issueOne(product, key)));

		Set<Long> issueIds = Set.copyOf(results.stream().map(IssueView::id).toList());
		assertThat(issueIds).hasSize(1);
		assertThat(onHand(product)).isEqualTo(49);
		assertLedgerMatchesBalances(product);
	}

	private static IssueCommand issueOne(long product, String idempotencyKey) {
		return new IssueCommand(idempotencyKey, "Khoa Nội", MIN_REMAINING_DAYS, null, USER,
				List.of(new IssueCommand.Line(product, BASE_UNIT, 1)));
	}

	private <T> List<T> runConcurrently(int tasks, IndexedTask<T> task) throws Exception {
		CountDownLatch start = new CountDownLatch(1);
		List<Future<T>> futures = new ArrayList<>();
		try (ExecutorService pool = Executors.newFixedThreadPool(THREADS)) {
			for (int i = 0; i < tasks; i++) {
				int index = i;
				Callable<T> call = () -> {
					start.await();
					return task.run(index);
				};
				futures.add(pool.submit(call));
			}
			start.countDown();
			List<T> results = new ArrayList<>();
			for (Future<T> future : futures) {
				results.add(future.get(1, TimeUnit.MINUTES));
			}
			return results;
		}
	}

	@FunctionalInterface
	private interface IndexedTask<T> {

		T run(int index) throws Exception;

	}

	private long newProduct() {
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		long category = jdbc.sql("INSERT INTO catalog.category (code, name) VALUES (:c, 'Test') RETURNING id")
			.param("c", "T-" + suffix)
			.query(Long.class)
			.single();
		long product = jdbc.sql("""
				INSERT INTO catalog.product (sku, name, active_ingredient, category_id, storage_condition, base_unit,
				                             min_shelf_life_on_receipt_days)
				VALUES (:sku, 'Paracetamol test', 'Paracetamol', :category, 'NORMAL', :unit, 0)
				RETURNING id
				""")
			.param("sku", "SKU-" + suffix)
			.param("category", category)
			.param("unit", BASE_UNIT)
			.query(Long.class)
			.single();
		jdbc.sql("INSERT INTO catalog.product_unit (product_id, unit_name, factor_to_base) VALUES (:p, :u, 1)")
			.param("p", product)
			.param("u", BASE_UNIT)
			.update();
		return product;
	}

	private long newLocation() {
		String suffix = UUID.randomUUID().toString().substring(0, 8);
		long warehouse = jdbc.sql("INSERT INTO inventory.warehouse (code, name) VALUES (:c, 'Kho test') RETURNING id")
			.param("c", "W" + suffix)
			.query(Long.class)
			.single();
		long zone = jdbc.sql("""
				INSERT INTO inventory.zone (warehouse_id, code, name, storage_condition)
				VALUES (:w, 'Z1', 'Khu thường', 'NORMAL') RETURNING id
				""")
			.param("w", warehouse)
			.query(Long.class)
			.single();
		return jdbc.sql("INSERT INTO inventory.location (zone_id, code) VALUES (:z, 'A-01') RETURNING id")
			.param("z", zone)
			.query(Long.class)
			.single();
	}

	private void receive(long product, long location, Map<String, Integer> expiryInDaysByLot,
			Map<String, Long> quantityByLot) {
		LocalDate today = LocalDate.now(clock);
		List<ReceiptCommand.Line> lines = expiryInDaysByLot.entrySet()
			.stream()
			.map(e -> new ReceiptCommand.Line(product, e.getKey(), null, today.plusDays(e.getValue()), location,
					BASE_UNIT, quantityByLot.get(e.getKey()), BigDecimal.ONE))
			.toList();
		inventory.receive(new ReceiptCommand(null, null, null, null, USER, lines));
	}

	private long onHand(long product) {
		return jdbc.sql("""
				SELECT coalesce(sum(sb.on_hand), 0) FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id WHERE b.product_id = :p
				""")
			.param("p", product)
			.query(Long.class)
			.single();
	}

	private Map<String, Long> onHandByLot(long product) {
		return jdbc.sql("""
				SELECT b.lot_number, sum(sb.on_hand) AS on_hand FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id WHERE b.product_id = :p GROUP BY b.lot_number
				""")
			.param("p", product)
			.query((rs, row) -> Map.entry(rs.getString("lot_number"), rs.getLong("on_hand")))
			.list()
			.stream()
			.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}

	private void assertLedgerMatchesBalances(long product) {
		long mismatches = jdbc.sql("""
				SELECT count(*) FROM inventory.stock_balance sb
				JOIN inventory.batch b ON b.id = sb.batch_id
				LEFT JOIN (SELECT batch_id, location_id, sum(quantity) AS total FROM inventory.stock_movement
				           GROUP BY batch_id, location_id) m
				  ON m.batch_id = sb.batch_id AND m.location_id = sb.location_id
				WHERE b.product_id = :p AND coalesce(m.total, 0) <> sb.on_hand
				""")
			.param("p", product)
			.query(Long.class)
			.single();
		assertThat(mismatches).isZero();
	}

}
