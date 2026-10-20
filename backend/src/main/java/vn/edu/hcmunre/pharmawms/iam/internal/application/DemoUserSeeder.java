package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.iam.Role;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.AppUserRepository;

/**
 * Creates one account per role for demos. Disabled with {@code DEMO_ENABLED=false}.
 */
@Component
@Order(0)
@ConditionalOnBooleanProperty("pharmawms.demo.enabled")
class DemoUserSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DemoUserSeeder.class);

	private record DemoAccount(String username, String fullName, Role role) {
	}

	private static final DemoAccount[] ACCOUNTS = {
			new DemoAccount("admin", "Quản trị viên", Role.ADMIN),
			new DemoAccount("duocsi", "DS. Nguyễn Thị Lan", Role.PHARMACIST_MANAGER),
			new DemoAccount("thukho", "Trần Văn Kho", Role.STOREKEEPER),
			new DemoAccount("muahang", "Lê Thị Mua", Role.PURCHASER) };

	private final AppUserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final Clock clock;
	private final String demoPassword;

	DemoUserSeeder(AppUserRepository users, PasswordEncoder passwordEncoder, Clock clock,
			@Value("${pharmawms.demo.password}") String demoPassword) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
		this.demoPassword = demoPassword;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		for (DemoAccount account : ACCOUNTS) {
			if (!users.existsByUsernameIgnoreCase(account.username())) {
				users.save(new AppUser(account.username(), passwordEncoder.encode(demoPassword), account.fullName(),
						account.role(), clock.instant()));
				log.info("Created demo user '{}' ({})", account.username(), account.role());
			}
		}
	}

}
