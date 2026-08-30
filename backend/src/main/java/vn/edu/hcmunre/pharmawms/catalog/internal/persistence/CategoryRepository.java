package vn.edu.hcmunre.pharmawms.catalog.internal.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Category;

public interface CategoryRepository extends JpaRepository<Category, Long> {

	boolean existsByCodeIgnoreCase(String code);

}
