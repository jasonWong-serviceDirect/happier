package dev.happier.voiceoverlay

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityNodeInfo

data class ScreenContentResult(
    val app: String,
    val url: String?,
    val visibleText: List<String>
)

object ScreenContentReader {

    // Known browser packages and their URL bar view IDs
    private val BROWSER_URL_BAR_IDS = mapOf(
        "com.android.chrome" to "com.android.chrome:id/url_bar",
        "org.mozilla.firefox" to "org.mozilla.firefox:id/mozac_browser_toolbar_url_view",
        "com.brave.browser" to "com.brave.browser:id/url_bar",
        "com.microsoft.emmx" to "com.microsoft.emmx:id/url_bar",
    )

    fun read(service: AccessibilityService): ScreenContentResult {
        val rootNode = service.rootInActiveWindow
            ?: return ScreenContentResult(app = "", url = null, visibleText = emptyList())

        val packageName = rootNode.packageName?.toString() ?: ""
        val url = extractUrl(rootNode, packageName)
        val visibleText = extractVisibleText(rootNode)

        rootNode.recycle()

        return ScreenContentResult(
            app = packageName,
            url = url,
            visibleText = visibleText
        )
    }

    private fun extractUrl(root: AccessibilityNodeInfo, packageName: String): String? {
        val viewId = BROWSER_URL_BAR_IDS[packageName] ?: return null

        val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
        if (nodes.isNullOrEmpty()) return null

        val urlNode = nodes[0]
        val url = urlNode.text?.toString()
        nodes.forEach { it.recycle() }
        return url
    }

    private fun extractVisibleText(node: AccessibilityNodeInfo, maxDepth: Int = 20): List<String> {
        if (maxDepth <= 0) return emptyList()

        val texts = mutableListOf<String>()

        val text = node.text?.toString()?.trim()
        if (!text.isNullOrEmpty() && text.length > 1) {
            texts.add(text)
        }

        val contentDesc = node.contentDescription?.toString()?.trim()
        if (!contentDesc.isNullOrEmpty() && contentDesc.length > 1 && contentDesc != text) {
            texts.add(contentDesc)
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (child.isVisibleToUser) {
                texts.addAll(extractVisibleText(child, maxDepth - 1))
            }
            child.recycle()
        }

        return texts
    }
}
