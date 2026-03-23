const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo config plugin that adds networkSecurityConfig and largeHeap to the
 * Android manifest <application> tag. Required for self-hosted server with
 * Caddy self-signed TLS certificate.
 *
 * The actual network_security_config.xml and caddy_root.pem must be placed
 * in android/app/src/main/res/ after prebuild (they reference the Docker cert).
 */
function withSelfHostNetwork(config) {
    return withAndroidManifest(config, (config) => {
        const app = config.modResults.manifest.application?.[0];
        if (!app) return config;

        app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
        app.$['android:largeHeap'] = 'true';

        return config;
    });
}

module.exports = withSelfHostNetwork;
