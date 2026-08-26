package vn.edu.hcmunre.pharmawms.shared.error;

import java.util.Map;

import org.springframework.http.HttpStatus;

/**
 * A rule violation that is safe to show to the user. The {@code code} is a stable identifier
 * clients can rely on; the message is human readable (Vietnamese).
 */
public class BusinessException extends RuntimeException {

	private final String code;
	private final HttpStatus status;
	private final Map<String, Object> details;

	public BusinessException(String code, HttpStatus status, String message, Map<String, Object> details) {
		super(message);
		this.code = code;
		this.status = status;
		this.details = Map.copyOf(details);
	}

	public static BusinessException notFound(String code, String message) {
		return new BusinessException(code, HttpStatus.NOT_FOUND, message, Map.of());
	}

	public static BusinessException conflict(String code, String message) {
		return new BusinessException(code, HttpStatus.CONFLICT, message, Map.of());
	}

	public static BusinessException conflict(String code, String message, Map<String, Object> details) {
		return new BusinessException(code, HttpStatus.CONFLICT, message, details);
	}

	public static BusinessException unprocessable(String code, String message) {
		return new BusinessException(code, HttpStatus.UNPROCESSABLE_CONTENT, message, Map.of());
	}

	public static BusinessException unprocessable(String code, String message, Map<String, Object> details) {
		return new BusinessException(code, HttpStatus.UNPROCESSABLE_CONTENT, message, details);
	}

	public static BusinessException forbidden(String code, String message) {
		return new BusinessException(code, HttpStatus.FORBIDDEN, message, Map.of());
	}

	public static BusinessException unauthorized(String code, String message) {
		return new BusinessException(code, HttpStatus.UNAUTHORIZED, message, Map.of());
	}

	public static BusinessException tooManyRequests(String code, String message) {
		return new BusinessException(code, HttpStatus.TOO_MANY_REQUESTS, message, Map.of());
	}

	public static BusinessException serviceUnavailable(String code, String message) {
		return new BusinessException(code, HttpStatus.SERVICE_UNAVAILABLE, message, Map.of());
	}

	public String getCode() {
		return code;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public Map<String, Object> getDetails() {
		return details;
	}

}
