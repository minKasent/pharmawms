package vn.edu.hcmunre.pharmawms.shared;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Human-readable document numbers such as {@code PN-20261012-000042}.
 */
public final class DocumentCodes {

	private static final DateTimeFormatter DAY = DateTimeFormatter.BASIC_ISO_DATE;

	private DocumentCodes() {
	}

	public static String format(String prefix, LocalDate day, long sequence) {
		return "%s-%s-%06d".formatted(prefix, DAY.format(day), sequence);
	}

}
