package vn.edu.hcmunre.pharmawms.iam;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import vn.edu.hcmunre.pharmawms.iam.internal.domain.AppUser;
import vn.edu.hcmunre.pharmawms.iam.internal.persistence.AppUserRepository;

/**
 * Read-only lookup of user display names for other modules (e.g. "approved by").
 */
@Service
@Transactional(readOnly = true)
public class UserDirectory {

	private final AppUserRepository users;

	UserDirectory(AppUserRepository users) {
		this.users = users;
	}

	public Map<Long, String> fullNames(Collection<Long> userIds) {
		return users.findAllById(userIds)
			.stream()
			.collect(Collectors.toMap(AppUser::getId, AppUser::getFullName));
	}

	public String fullName(long userId) {
		return fullNames(List.of(userId)).getOrDefault(userId, "#" + userId);
	}

}
