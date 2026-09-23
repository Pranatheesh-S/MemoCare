const { withEntitlementsPlist, withInfoPlist } = require("@expo/config-plugins");

/**
 * Personal Apple teams cannot provision Push Notifications.
 * Keep local on-device reminders; drop the remote-push entitlement.
 */
function withPersonalTeam(config) {
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    const modes = mod.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      mod.modResults.UIBackgroundModes = modes.filter((mode) => mode !== "remote-notification");
      if (mod.modResults.UIBackgroundModes.length === 0) {
        delete mod.modResults.UIBackgroundModes;
      }
    }
    return mod;
  });
  return config;
}

module.exports = withPersonalTeam;
