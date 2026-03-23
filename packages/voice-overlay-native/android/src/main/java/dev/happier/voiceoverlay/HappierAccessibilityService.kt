package dev.happier.voiceoverlay

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class HappierAccessibilityService : AccessibilityService() {

    companion object {
        var instance: HappierAccessibilityService? = null
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // We don't need to react to events — we read on-demand via getScreenContent()
    }

    override fun onInterrupt() {
        // Required override, nothing to do
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
