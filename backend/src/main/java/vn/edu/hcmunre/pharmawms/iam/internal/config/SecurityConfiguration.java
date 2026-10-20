package vn.edu.hcmunre.pharmawms.iam.internal.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
@EnableMethodSecurity
class SecurityConfiguration {

	static final String PERMISSIONS_CLAIM = "perms";

	@Bean
	SecurityFilterChain apiSecurity(HttpSecurity http) throws Exception {
		http.csrf(csrf -> csrf.disable())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(requests -> requests
				.requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout")
				.permitAll()
				.requestMatchers("/actuator/health/**", "/actuator/info", "/actuator/prometheus")
				.permitAll()
				.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
				.permitAll()
				.anyRequest()
				.authenticated())
			.oauth2ResourceServer(resourceServer -> resourceServer
				.jwt(jwt -> jwt.jwtAuthenticationConverter(permissionsConverter()))
				.authenticationEntryPoint((request, response, exception) -> writeProblem(response,
						HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")))
			.exceptionHandling(exceptions -> exceptions
				.authenticationEntryPoint((request, response, exception) -> writeProblem(response,
						HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Bạn cần đăng nhập để thực hiện thao tác này."))
				.accessDeniedHandler((request, response, exception) -> writeProblem(response, HttpStatus.FORBIDDEN,
						"ACCESS_DENIED", "Bạn không có quyền thực hiện thao tác này.")));
		return http.build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	private static JwtAuthenticationConverter permissionsConverter() {
		var authorities = new JwtGrantedAuthoritiesConverter();
		authorities.setAuthoritiesClaimName(PERMISSIONS_CLAIM);
		authorities.setAuthorityPrefix("");
		var converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(authorities);
		return converter;
	}

	private static void writeProblem(HttpServletResponse response, HttpStatus status, String code, String detail)
			throws IOException {
		response.setStatus(status.value());
		response.setCharacterEncoding(StandardCharsets.UTF_8.name());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.getWriter()
			.write("{\"type\":\"about:blank\",\"title\":\"%s\",\"status\":%d,\"detail\":\"%s\",\"code\":\"%s\"}"
				.formatted(status.getReasonPhrase(), status.value(), detail, code));
	}

}
