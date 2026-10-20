/**
 * Demand forecasting and replenishment: calls the AI service (with a statistical fallback),
 * turns forecasts into expiry-aware purchase suggestions, and hands accepted ones to purchasing.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Forecasting")
package vn.edu.hcmunre.pharmawms.forecasting;
