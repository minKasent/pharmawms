package vn.edu.hcmunre.pharmawms.iam.internal.config;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

@Configuration(proxyBeanMethods = false)
class JwtConfiguration {

	static final String KEY_ID = "pharmawms-signing-key";

	private static final Logger log = LoggerFactory.getLogger(JwtConfiguration.class);
	private static final int RSA_KEY_SIZE = 2048;

	@Bean
	RsaKeyPair jwtSigningKeys(SecurityProperties properties) {
		var jwt = properties.jwt();
		if (jwt.hasConfiguredKeys()) {
			return new RsaKeyPair(parsePublicKey(jwt.publicKeyPem()), parsePrivateKey(jwt.privateKeyPem()));
		}
		log.warn("JWT_PRIVATE_KEY_PEM/JWT_PUBLIC_KEY_PEM not set: generating an ephemeral RSA key pair. "
				+ "Tokens become invalid on restart. Configure keys outside local development.");
		return generate();
	}

	@Bean
	JwtEncoder jwtEncoder(RsaKeyPair keys) {
		var rsaKey = new RSAKey.Builder(keys.publicKey()).privateKey(keys.privateKey()).keyID(KEY_ID).build();
		return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(rsaKey)));
	}

	@Bean
	JwtDecoder jwtDecoder(RsaKeyPair keys, SecurityProperties properties) {
		var decoder = NimbusJwtDecoder.withPublicKey(keys.publicKey()).build();
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
				JwtValidators.createDefaultWithIssuer(properties.jwt().issuer())));
		return decoder;
	}

	record RsaKeyPair(RSAPublicKey publicKey, RSAPrivateKey privateKey) {
	}

	private static RsaKeyPair generate() {
		try {
			var generator = KeyPairGenerator.getInstance("RSA");
			generator.initialize(RSA_KEY_SIZE);
			KeyPair pair = generator.generateKeyPair();
			return new RsaKeyPair((RSAPublicKey) pair.getPublic(), (RSAPrivateKey) pair.getPrivate());
		}
		catch (GeneralSecurityException exception) {
			throw new IllegalStateException("Cannot generate RSA key pair", exception);
		}
	}

	private static RSAPublicKey parsePublicKey(String pem) {
		try {
			var spec = new X509EncodedKeySpec(decodePem(pem));
			return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
		}
		catch (GeneralSecurityException | IllegalArgumentException exception) {
			throw new IllegalStateException("JWT_PUBLIC_KEY_PEM is not a valid X.509 RSA public key", exception);
		}
	}

	private static RSAPrivateKey parsePrivateKey(String pem) {
		try {
			var spec = new PKCS8EncodedKeySpec(decodePem(pem));
			return (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(spec);
		}
		catch (GeneralSecurityException | IllegalArgumentException exception) {
			throw new IllegalStateException("JWT_PRIVATE_KEY_PEM is not a valid PKCS#8 RSA private key", exception);
		}
	}

	private static byte[] decodePem(String pem) {
		String base64 = pem.replaceAll("-----(BEGIN|END) [A-Z ]+-----", "").replaceAll("\\s", "");
		return Base64.getDecoder().decode(base64);
	}

}
