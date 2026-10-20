package vn.edu.hcmunre.pharmawms.shared.error;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(BusinessException.class)
	ProblemDetail handleBusiness(BusinessException exception) {
		var problem = problem(exception.getStatus(), exception.getCode(), exception.getMessage());
		if (!exception.getDetails().isEmpty()) {
			problem.setProperty("details", exception.getDetails());
		}
		return problem;
	}

	@ExceptionHandler({ AccessDeniedException.class, AuthorizationDeniedException.class })
	ProblemDetail handleAccessDenied(RuntimeException exception) {
		return problem(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Bạn không có quyền thực hiện thao tác này.");
	}

	@ExceptionHandler({ ObjectOptimisticLockingFailureException.class, PessimisticLockingFailureException.class })
	ProblemDetail handleConcurrentUpdate(RuntimeException exception) {
		return problem(HttpStatus.CONFLICT, "CONCURRENT_UPDATE",
				"Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại và thử lại.");
	}

	@ExceptionHandler(DataIntegrityViolationException.class)
	ProblemDetail handleIntegrity(DataIntegrityViolationException exception) {
		log.warn("Data integrity violation: {}", exception.getMostSpecificCause().getMessage());
		return problem(HttpStatus.CONFLICT, "DATA_CONFLICT",
				"Yêu cầu xung đột với dữ liệu hiện có (trùng mã hoặc đã được xử lý).");
	}

	@ExceptionHandler(Exception.class)
	ProblemDetail handleUnexpected(Exception exception) {
		log.error("Unexpected error", exception);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.");
	}

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<Map<String, String>> fieldErrors = exception.getBindingResult()
			.getFieldErrors()
			.stream()
			.map(error -> Map.of("field", error.getField(), "message", String.valueOf(error.getDefaultMessage())))
			.toList();
		var problem = problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Dữ liệu gửi lên không hợp lệ.");
		problem.setProperty("fieldErrors", fieldErrors);
		return ResponseEntity.badRequest().body(problem);
	}

	@Override
	protected ResponseEntity<Object> createResponseEntity(Object body, HttpHeaders headers, HttpStatusCode statusCode,
			WebRequest request) {
		if (body instanceof ProblemDetail problem
				&& (problem.getProperties() == null || !problem.getProperties().containsKey("code"))) {
			problem.setProperty("code", "REQUEST_INVALID");
		}
		return super.createResponseEntity(body, headers, statusCode, request);
	}

	private static ProblemDetail problem(HttpStatusCode status, String code, String detail) {
		var problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setProperty("code", code);
		return problem;
	}

}
