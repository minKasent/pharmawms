package vn.edu.hcmunre.pharmawms.iam;

import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import vn.edu.hcmunre.pharmawms.shared.error.BusinessException;

/**
 * Identity of the authenticated caller, read from the verified access token.
 */
@Component
public class CurrentUser {

	public static final String USER_ID_CLAIM = "uid";

	public long id() {
		var authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
			Object userId = jwt.getClaim(USER_ID_CLAIM);
			if (userId instanceof Number number) {
				return number.longValue();
			}
		}
		throw BusinessException.unauthorized("AUTH_REQUIRED", "Bạn cần đăng nhập để thực hiện thao tác này.");
	}

}
