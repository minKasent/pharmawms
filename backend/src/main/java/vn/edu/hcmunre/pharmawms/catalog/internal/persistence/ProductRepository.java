package vn.edu.hcmunre.pharmawms.catalog.internal.persistence;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import vn.edu.hcmunre.pharmawms.catalog.internal.domain.Product;

public interface ProductRepository extends JpaRepository<Product, Long> {

	boolean existsBySkuIgnoreCase(String sku);

	@EntityGraph(attributePaths = { "category", "units" })
	Optional<Product> findWithDetailsById(long id);

	@EntityGraph(attributePaths = { "category", "units" })
	List<Product> findAllWithDetailsByIdIn(Collection<Long> ids);

	@EntityGraph(attributePaths = { "category", "units" })
	@Query("select p from Product p where p.active = true order by p.sku")
	List<Product> findAllActiveWithDetails();

	/**
	 * Category is fetched in the same query to avoid N+1 on list pages; units are not needed there.
	 */
	@EntityGraph(attributePaths = "category")
	@Query("""
			select p from Product p
			where (lower(p.name) like :pattern or lower(p.sku) like :pattern or lower(p.activeIngredient) like :pattern)
			  and (:categoryId is null or p.category.id = :categoryId)
			  and (:active is null or p.active = :active)
			""")
	Page<Product> search(String pattern, Long categoryId, Boolean active, Pageable pageable);

}
