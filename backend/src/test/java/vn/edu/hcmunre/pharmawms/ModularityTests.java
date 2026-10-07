package vn.edu.hcmunre.pharmawms;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Fails when a module reaches into another module's internals (e.g. forecasting using an
 * inventory repository instead of {@code InventoryApi}).
 */
class ModularityTests {

	private final ApplicationModules modules = ApplicationModules.of(PharmawmsApplication.class);

	@Test
	void modulesRespectTheirBoundaries() {
		modules.verify();
	}

	@Test
	void writesModuleDocumentation() {
		new Documenter(modules).writeModulesAsPlantUml().writeIndividualModulesAsPlantUml();
	}

}
