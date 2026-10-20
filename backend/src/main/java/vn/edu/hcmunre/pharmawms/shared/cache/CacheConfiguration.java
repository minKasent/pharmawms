package vn.edu.hcmunre.pharmawms.shared.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Configuration;

/**
 * The cache is an optimisation only: when Redis is unavailable, calls fall through to the
 * database instead of failing the request.
 */
@Configuration(proxyBeanMethods = false)
class CacheConfiguration implements CachingConfigurer {

	private static final Logger log = LoggerFactory.getLogger(CacheConfiguration.class);

	@Override
	public CacheErrorHandler errorHandler() {
		return new CacheErrorHandler() {

			@Override
			public void handleCacheGetError(RuntimeException exception, Cache cache, Object key) {
				log.warn("Cache get failed on {} [{}]: {}", cache.getName(), key, exception.getMessage());
			}

			@Override
			public void handleCachePutError(RuntimeException exception, Cache cache, Object key, Object value) {
				log.warn("Cache put failed on {} [{}]: {}", cache.getName(), key, exception.getMessage());
			}

			@Override
			public void handleCacheEvictError(RuntimeException exception, Cache cache, Object key) {
				log.warn("Cache evict failed on {} [{}]: {}", cache.getName(), key, exception.getMessage());
			}

			@Override
			public void handleCacheClearError(RuntimeException exception, Cache cache) {
				log.warn("Cache clear failed on {}: {}", cache.getName(), exception.getMessage());
			}

		};
	}

}
