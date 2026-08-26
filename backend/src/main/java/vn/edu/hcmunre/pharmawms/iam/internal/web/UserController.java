package vn.edu.hcmunre.pharmawms.iam.internal.web;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.iam.CurrentUser;
import vn.edu.hcmunre.pharmawms.iam.Role;
import vn.edu.hcmunre.pharmawms.iam.internal.application.UserAdminService;
import vn.edu.hcmunre.pharmawms.iam.internal.application.UserView;

@Tag(name = "Users")
@RestController
@RequestMapping("/api/v1")
class UserController {

	private static final int MIN_PASSWORD_LENGTH = 8;
	private static final int MAX_PASSWORD_LENGTH = 128;

	private final UserAdminService userAdminService;
	private final CurrentUser currentUser;

	UserController(UserAdminService userAdminService, CurrentUser currentUser) {
		this.userAdminService = userAdminService;
		this.currentUser = currentUser;
	}

	@GetMapping("/me")
	UserView me() {
		return userAdminService.get(currentUser.id());
	}

	@GetMapping("/users")
	@PreAuthorize("hasAuthority('USER_MANAGE')")
	List<UserView> list() {
		return userAdminService.list();
	}

	@PostMapping("/users")
	@ResponseStatus(HttpStatus.CREATED)
	@PreAuthorize("hasAuthority('USER_MANAGE')")
	UserView create(@Valid @RequestBody CreateUserRequest request) {
		return userAdminService.create(request.username(), request.password(), request.fullName().trim(),
				request.role());
	}

	@PutMapping("/users/{id}")
	@PreAuthorize("hasAuthority('USER_MANAGE')")
	UserView update(@PathVariable long id, @Valid @RequestBody UpdateUserRequest request) {
		return userAdminService.update(id, currentUser.id(), request.fullName().trim(), request.role(),
				request.enabled());
	}

	@PostMapping("/users/{id}/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PreAuthorize("hasAuthority('USER_MANAGE')")
	void resetPassword(@PathVariable long id, @Valid @RequestBody ResetPasswordRequest request) {
		userAdminService.resetPassword(id, request.newPassword());
	}

	record CreateUserRequest(
			@NotBlank @Size(min = 3, max = 50) @Pattern(regexp = "^[a-zA-Z0-9._-]+$") String username,
			@NotBlank @Size(min = MIN_PASSWORD_LENGTH, max = MAX_PASSWORD_LENGTH) String password,
			@NotBlank @Size(max = 100) String fullName, @NotNull Role role) {
	}

	record UpdateUserRequest(@NotBlank @Size(max = 100) String fullName, @NotNull Role role, boolean enabled) {
	}

	record ResetPasswordRequest(@NotBlank @Size(min = MIN_PASSWORD_LENGTH, max = MAX_PASSWORD_LENGTH) String newPassword) {
	}

}
