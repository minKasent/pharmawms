package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.iam.Role;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.AppUserRepository;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.RefreshTokenRepository;
import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

@Service
public class UserAdminService {

	private static final int MAX_BCRYPT_PASSWORD_BYTES = 72;

	private final AppUserRepository users;
	private final RefreshTokenRepository refreshTokens;
	private final PasswordEncoder passwordEncoder;
	private final Clock clock;

	UserAdminService(AppUserRepository users, RefreshTokenRepository refreshTokens, PasswordEncoder passwordEncoder,
			Clock clock) {
		this.users = users;
		this.refreshTokens = refreshTokens;
		this.passwordEncoder = passwordEncoder;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public List<UserView> list() {
		return users.findAll(Sort.by("username")).stream().map(UserView::from).toList();
	}

	@Transactional(readOnly = true)
	public UserView get(long id) {
		return UserView.from(find(id));
	}

	@Transactional
	public UserView create(String username, String password, String fullName, Role role) {
		requireValidPasswordLength(password);
		if (users.existsByUsernameIgnoreCase(username)) {
			throw BusinessException.conflict("USERNAME_TAKEN", "Tên đăng nhập '%s' đã tồn tại.".formatted(username));
		}
		var user = new AppUser(username, passwordEncoder.encode(password), fullName, role, clock.instant());
		return UserView.from(users.save(user));
	}

	@Transactional
	public UserView update(long id, long actingUserId, String fullName, Role role, boolean enabled) {
		var user = find(id);
		boolean roleChanged = role != user.getRole();
		if (id == actingUserId && (!enabled || roleChanged)) {
			throw BusinessException.unprocessable("CANNOT_DEMOTE_SELF",
					"Không thể tự khóa hoặc tự đổi vai trò của chính mình.");
		}
		user.update(fullName, role, enabled);
		if (!enabled || roleChanged) {
			refreshTokens.revokeAllByUserId(id, clock.instant());
		}
		return UserView.from(user);
	}

	@Transactional
	public void resetPassword(long id, String newPassword) {
		requireValidPasswordLength(newPassword);
		find(id).changePassword(passwordEncoder.encode(newPassword));
		refreshTokens.revokeAllByUserId(id, clock.instant());
	}

	private static void requireValidPasswordLength(String rawPassword) {
		if (rawPassword.getBytes(StandardCharsets.UTF_8).length > MAX_BCRYPT_PASSWORD_BYTES) {
			throw BusinessException.unprocessable("PASSWORD_TOO_LONG",
					"Mật khẩu không được vượt quá 72 byte (UTF-8).");
		}
	}

	private AppUser find(long id) {
		return users.findById(id)
			.orElseThrow(() -> BusinessException.notFound("USER_NOT_FOUND", "Không tìm thấy người dùng #" + id));
	}

}
