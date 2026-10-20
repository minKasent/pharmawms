package vn.edu.hcmunre.pharmawms.iam.internal.application;

import java.time.Instant;
import java.util.List;

import vn.edu.hcmunre.pharmawms.iam.Permission;
import vn.edu.hcmunre.pharmawms.iam.Role;
import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;

public record UserView(long id, String username, String fullName, Role role, String roleDisplayName,
		boolean enabled, List<String> permissions, Instant createdAt) {

	public static UserView from(AppUser user) {
		List<String> permissions = user.getRole().permissions().stream().map(Permission::name).sorted().toList();
		return new UserView(user.getId(), user.getUsername(), user.getFullName(), user.getRole(),
				user.getRole().displayName(), user.isEnabled(), permissions, user.getCreatedAt());
	}

}
