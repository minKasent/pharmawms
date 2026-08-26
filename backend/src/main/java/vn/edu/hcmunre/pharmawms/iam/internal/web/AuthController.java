package vn.edu.hcmunre.pharmawms.iam.internal.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import vn.edu.hcmunre.pharmawms.iam.internal.application.AuthService;
import vn.edu.hcmunre.pharmawms.iam.internal.application.AuthTokens;

@Tag(name = "Auth")
@RestController
@RequestMapping("/api/v1/auth")
class AuthController {

	private static final int MAX_CREDENTIAL_LENGTH = 128;

	private final AuthService authService;

	AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/login")
	AuthTokens login(@Valid @RequestBody LoginRequest request) {
		return authService.login(request.username().trim(), request.password());
	}

	@PostMapping("/refresh")
	AuthTokens refresh(@Valid @RequestBody RefreshRequest request) {
		return authService.refresh(request.refreshToken());
	}

	@PostMapping("/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void logout(@Valid @RequestBody RefreshRequest request) {
		authService.logout(request.refreshToken());
	}

	record LoginRequest(@NotBlank @Size(max = MAX_CREDENTIAL_LENGTH) String username,
			@NotBlank @Size(max = MAX_CREDENTIAL_LENGTH) String password) {
	}

	record RefreshRequest(@NotBlank @Size(max = MAX_CREDENTIAL_LENGTH) String refreshToken) {
	}

}
