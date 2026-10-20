package vn.edu.hcmunre.pharmawms.iam.internal.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import vn.edu.hcmunre.pharmawms.iam.Role;

@Entity
@Table(schema = "iam", name = "app_user")
public class AppUser {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, unique = true)
	private String username;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Column(name = "full_name", nullable = false)
	private String fullName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Role role;

	@Column(nullable = false)
	private boolean enabled;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Version
	private long version;

	protected AppUser() {
	}

	public AppUser(String username, String passwordHash, String fullName, Role role, Instant createdAt) {
		this.username = username;
		this.passwordHash = passwordHash;
		this.fullName = fullName;
		this.role = role;
		this.enabled = true;
		this.createdAt = createdAt;
	}

	public void update(String fullName, Role role, boolean enabled) {
		this.fullName = fullName;
		this.role = role;
		this.enabled = enabled;
	}

	public void changePassword(String passwordHash) {
		this.passwordHash = passwordHash;
	}

	public Long getId() {
		return id;
	}

	public String getUsername() {
		return username;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public String getFullName() {
		return fullName;
	}

	public Role getRole() {
		return role;
	}

	public boolean isEnabled() {
		return enabled;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
