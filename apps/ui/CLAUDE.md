# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `yarn start` - Start the Expo development server
- `yarn ios` - Run the app on iOS simulator
- `yarn android` - Run the app on Android emulator
- `yarn web` - Run the app in web browser
- `yarn prebuild` - Generate native iOS and Android directories
- `yarn typecheck` - Run TypeScript type checking after all changes

### macOS Desktop (Tauri)
- `yarn tauri:dev` - Run macOS desktop app with hot reload
- `yarn tauri:build:dev` - Build development variant
- `yarn tauri:build:preview` - Build preview variant
- `yarn tauri:build:production` - Build production variant

### Testing
- `yarn test` - Run tests in watch mode (Vitest)
- Tests exist and should be kept green (Vitest)

### Production
- `yarn ota` - Deploy over-the-air updates via EAS Update to production branch

## Changelog Management

The app includes an in-app changelog feature that displays version history to users. When making changes:

### Adding Changelog Entries

1. **Always update the latest version** in `/CHANGELOG.md` when adding new features or fixes
2. **Format**: Each version follows this structure:
   ```markdown
   ## Version [NUMBER] - YYYY-MM-DD
   - Brief description of change/feature/fix
   - Another change description
   - Keep descriptions user-friendly and concise
   ```

3. **Version numbering**: Increment the version number for each release (1, 2, 3, etc.)
4. **Date format**: Use ISO date format (YYYY-MM-DD)

### Regenerating Changelog Data

After updating CHANGELOG.md, run:
```bash
npx tsx sources/scripts/parseChangelog.ts
```

This generates `sources/changelog/changelog.json` which is used by the app.

### Best Practices

- Write changelog entries from the user's perspective
- Start each entry with a verb (Added, Fixed, Improved, Updated, Removed)
- Group related changes together
- Keep descriptions concise but informative
- Focus on what changed, not technical implementation details
- The changelog is automatically parsed during `yarn ota` and `yarn ota:production`
- Always improve and expand basic changelog descriptions to be more user-friendly and informative
- Include a brief summary paragraph before bullet points for each version explaining the theme of the update

### Example Entry

```markdown
## Version 4 - 2025-01-26
- Added dark mode support across all screens
- Fixed navigation issues on tablet devices  
- Improved app startup performance by 30%
- Updated authentication flow for better security
- Removed deprecated API endpoints
```

## Architecture Overview

### Core Technology Stack
- **React Native** with **Expo** SDK 54
- **TypeScript** with strict mode enabled
- **Unistyles** for cross-platform styling with themes and breakpoints
- **Expo Router v6** for file-based routing
- **Socket.io** for real-time WebSocket communication
- **libsodium** (via `@more-tech/react-native-libsodium`) for end-to-end encryption
- **LiveKit** for real-time voice communication

### Project Structure
```
sources/
├── app/              # Expo Router screens
├── auth/             # Authentication logic (QR code based)
├── components/       # Reusable UI components
├── sync/             # Real-time sync engine with encryption
└── utils/            # Utility functions
```

### Key Architectural Patterns

1. **Authentication Flow**: QR code-based authentication using expo-camera with challenge-response mechanism
2. **Data Synchronization**: WebSocket-based real-time sync with automatic reconnection and state management
3. **Encryption**: End-to-end encryption using libsodium for all sensitive data
4. **State Management**: React Context for auth state; sync state is centralized in `sources/sync/storage.ts` (Zustand) with domain slices under `sources/sync/store/domains/*`
5. **Real-time Voice**: LiveKit integration for voice communication sessions
6. **Platform-Specific Code**: Separate implementations for web vs native when needed

### Development Guidelines

- Use **4 spaces** for indentation
- Use **yarn** instead of npm for package management
- Path alias `@/*` maps to `./sources/*`
- TypeScript strict mode is enabled - ensure all code is properly typed
- Follow existing component patterns when creating new UI components
- Real-time sync is orchestrated by the `Sync` singleton in `sources/sync/sync.ts`, with domain logic extracted into `sources/sync/engine/*`
- Store all temporary scripts and any test outside of unit tests in sources/trash folder
- When setting screen parameters ALWAYS set them in _layout.tsx if possible this avoids layout shifts
- **Never use Alert module from React Native, always use @sources/modal/index.ts instead**
- **Always apply layout width constraints** from `@/components/layout` to full-screen ScrollViews and content containers for responsive design across device sizes
- Always run `yarn typecheck` after all changes to ensure type safety

### Theme, Typography, and i18n (Required)

- **No hardcoded colors**: do not introduce raw hex/rgb colors (e.g. `#000`, `#fff`) for UI styling. Use `useUnistyles()` theme tokens (`theme.colors.*`) or existing themed styles so light/dark/adaptive themes stay correct.
- **Icons must be themed**: icon `color` and background/tint props must come from theme tokens (avoid `black`/`white`).
- **Text must respect UI font scaling**:
  - Prefer `@/components/ui/text/Text` and `@/components/ui/text/TextInput` over `react-native` `Text`/`TextInput`.
  - Avoid hardcoded font sizes in new UI code. If you must set a base size, ensure it scales via `uiFontScale` (and stacks with OS Dynamic Type on native).
  - For embedded editors, use `resolveCodeEditorFontMetrics(...)` and propagate scale to Monaco/CodeMirror surfaces.
- **All user-facing copy must be translated**: use `t('...')` for UI strings, add keys to all supported locale files under `sources/text/translations/`, and avoid hardcoding English in components.

## Folder Structure & Naming Conventions (2026-01)

These conventions are **additive** to the guidelines above. The goal is to keep screens and sync logic easy to reason about.

### Naming
- Buckets are lowercase (e.g. `components`, `hooks`, `sync`, `utils`).
- Feature folders are `camelCase` (e.g. `newSession`, `agentInput`, `profileEdit`).
- Avoid `_folders` except Expo Router special files (e.g. `_layout.tsx`) and `__tests__`.
- Allowed `_*.ts` markers (organization only) inside module-ish folders: `_types.ts`, `_shared.ts`, `_constants.ts`.

### Screens and feature code
- Expo Router routes live in `sources/app/**`.
- Keep route files (Expo Router) as the screen entrypoints; extract non-trivial UI/logic into `sources/components/**`.

### Components: domain map (2026-01)
When adding or refactoring components, prefer placing them under one of these domains:
- `sources/components/ui/` — reusable UI primitives (lists, popovers, dropdowns, forms)
- `sources/components/sessions/` — session-related UX (`agentInput`, `newSession`, etc.)
- `sources/components/profiles/` — profile management UI (edit, list, pickers)
- `sources/components/secrets/` — secrets + requirements UI
- `sources/components/machines/` — machine-related UI
- `sources/components/tools/` — tool rendering + permission UI

Guidance (not a hard rule):
- Prefer reusing an existing domain over creating a new top-level folder under `sources/components/`.
- If a new domain is clearly warranted (distinct concept, multiple screens/features, long-term ownership), create it with a clear noun name and keep it cohesive.

Bucket rule:
- Use `components/`, `hooks/`, `modules/`, `utils/` only when they contain multiple files; avoid creating a 1-file subfolder just for structure.

### Sync organization
- `sources/sync/sync.ts` is the canonical sync orchestrator (public API + wiring) and remains the entrypoint.
- Extract cohesive logic into subdomains under `sources/sync/`:
  - `sources/sync/engine/*` — runtime helpers used by `Sync` (prefer a few domain files like `sessions.ts`, `machines.ts`, `settings.ts`; avoid “one helper per file” sprawl)
  - `sources/sync/store/domains/*` — Zustand domain slices
  - `sources/sync/ops/*` — RPC operation helpers (sessions/machines/capabilities)
  - `sources/sync/reducer/*` — message reducer pipeline (phases/helpers)
  - `sources/sync/typesRaw/*` — raw message schemas + normalization
- Prefer splitting by *domain* (sessions/messages/machines/settings) rather than generic `utils/` buckets.

Canonical entrypoints:
- `sources/sync/{storage.ts,ops.ts,typesRaw.ts,sync.ts}` are canonical entrypoints that define the public surface for sync.
- Extract internals under subfolders (`store/`, `ops/`, `typesRaw/`, `reducer/`, etc.) and have the entry files orchestrate them (import and compose).

## Modals & dialogs (web + native)

### Rules of thumb
- **Never call `Alert` / `Alert.prompt` directly**. Use `Modal` from `sources/modal` (`import { Modal } from '@/modal'`).
- **Avoid `react-native` `<Modal>`** for app-controlled overlays. Use the app modal system so stacking works consistently.
- If you need a new overlay:
  - “OK / Confirm / Prompt” → `Modal.alert()` / `Modal.confirm()` / `Modal.prompt()`
  - Custom UI → `Modal.show({ component, props })`

### Web implementation (Radix)
On web, `BaseModal` renders a Radix `Dialog` (portal to `document.body`) so focus, scroll, and pointer events behave correctly when stacking modals (including when an Expo Router / Vaul drawer is already open).

**Critical invariant:** Radix “singleton” stacks (DismissableLayer / FocusScope) must be shared across *all* dialogs. With Metro + package `exports`, mixing ESM and CJS entrypoints can load *two* Radix module instances and break focus/stacking.

- Use the CJS entrypoints via `sources/utils/radixCjs.ts` (`requireRadixDialog()` / `requireRadixDismissableLayer()`) for any web dialog primitives.
- Wrap stacked dialog content with `DismissableLayer.Branch` so underlying Radix/Vaul layers don’t treat the top dialog as “outside” and dismiss.
- Only the top-most modal should render a backdrop; `ModalProvider` handles this via `showBackdrop`.

### Native implementation (iOS/Android)
On native, stacking a React Navigation / Expo Router modal screen with an RN `<Modal>` can produce “invisible overlay blocks touches” and z-index ordering bugs.

- `BaseModal` renders a “portal-style” overlay inside the current screen tree (absolute fill + high `zIndex`) so touches/focus stay within the same navigation presentation context.
- `Modal.alert()` / `Modal.confirm()` use the native system alert UI on iOS/Android (good accessibility + expected platform UX).
- `Modal.prompt()` uses the app prompt modal on all platforms for consistent behavior (since `Alert.prompt` is iOS-only).

### Popovers (menus/tooltips)
Use the app `Popover` + `FloatingOverlay` for menus/tooltips/context menus.

- Use `portal={{ web: { target: 'body' }, native: true }}` when the anchor is inside overflow-clipped containers (headers, lists, scrollviews).
- For settings-style lists, prefer `ItemList` as the popover boundary (it provides a `PopoverBoundaryProvider` for the screen ScrollView). Avoid binding popover boundaries to `ItemGroup` containers, which can incorrectly clamp dropdown sizing/placement.
- When a popover must be constrained to a scroll container, pass the **scroll container ref** as the boundary (`DropdownMenu popoverBoundaryRef=...` / `Popover boundaryRef=...`). Do not use a nested non-scroll wrapper `View` ref unless you intentionally want viewport-wide bounds and have validated scroll alignment on web.
- When the backdrop is enabled (default), `onRequestClose` is required (Popover is controlled).
- For context-menu style overlays, prefer `backdrop={{ effect: 'blur', anchorOverlay: ..., closeOnPan: true }}` so the trigger stays crisp above the blur without cutout seams.
- On web, portaled popovers are wrapped in Radix `DismissableLayer.Branch` (via `radixCjs.ts`) so Expo Router/Vaul/Radix layers don’t treat them as “outside”.

## Settings persistence & sync (Account.settings + pending delta) — rules

### Correct model
- **Effective settings** = server settings merged with `settingsDefaults` (+ migrations in `settingsParse()`).
- **Pending settings** = a **delta-only** object of user-intended changes not yet ACKed by the server (`pending-settings`).
- `/v1/account/settings` **POST replaces the blob** (not a patch), so accidental uploads can overwrite server state.

### Hard rules (do NOT break these)
- **Never apply schema defaults when parsing pending deltas.**
  - Do NOT do `SettingsSchema.partial().parse(...)` (or any parse path that synthesizes missing keys) if the schema contains `.default(...)`.
  - Pending parsing must be “delta-only”: include a key only if it exists in the stored object and validates.
- **Treat settings as immutable.**
  - Never mutate `settings` (or nested arrays/objects like `secrets`, `profiles`, `favorite*`, `dismissedCLIWarnings`) in place.
  - Always update settings via `sync.applySettings({ field: nextValue })` / `useSettingMutable(...)` using immutable patterns (`map`, `filter`, `...spread`).
- **Avoid no-op writes on boot.**
  - Do not call `sync.applySettings()` unconditionally in mount effects.
  - Only persist when the value actually changed vs the current settings.
- **Never log secrets.**
  - Do not log `secrets[].encryptedValue.value` or env-var secret values. If you add logs, log only counts/booleans (`hasValue`) and keys.

### Defaults placement guidance
- It’s OK for `SettingsSchema` to have `.default(...)` for **effective settings parsing**, but you must ensure pending parsing does **not** trigger those defaults.
- If you need both behaviors, consider **separating schemas**:
  - `SettingsSchema` (effective) may include defaults
  - `PendingSettingsSchema` (delta-only) must not

### Pending storage when empty
- Writing `"{}"` for “no pending” is acceptable **only if pending parsing is delta-only** (so `{}` stays `{}`).
- Deleting the `pending-settings` key when empty is a recommended optimization (less churn/ambiguity), but not required for correctness once delta-only parsing is in place.

## Secret settings (encrypted-at-rest fields inside settings)

Some settings values are secrets (e.g. API keys). Even though the outer `Account.settings` blob is encrypted for server transport, we also require **field-level encryption at rest** so secrets are not stored as plaintext in MMKV/JSON after the blob is decrypted.

### Rules
- **Never persist plaintext secrets** in settings. Plaintext may be accepted as input, but must be sealed before persistence.
- **Decrypt just-in-time** (e.g. right before sending an encrypted machine RPC to spawn a session).
- **Never log secret values** (only counts/booleans like `hasValue`).

### How to add a new secret setting field
- Use the standardized secret container schema: **`SecretStringSchema`** from `sources/sync/secretSettings.ts`
  - Marker: **`_isSecretValue: true`** (required for automatic sealing)
  - Plaintext input only: `.value` (must not be persisted)
  - Ciphertext persisted: `.encryptedValue` (an `EncryptedStringSchema`)
- Sealing is automatic: `sync.applySettings(...)` runs `sealSecretsDeep(...)` (see `sources/sync/secretSettings.ts`).
- Decrypt just-in-time via `sync.decryptSecretValue(...)`.

### Internationalization (i18n) Guidelines

**CRITICAL: Always use the `t(...)` function for ALL user-visible strings**

#### Basic Usage
```typescript
import { t } from '@/text';

// ✅ Simple constants
t('common.cancel')              // "Cancel"
t('settings.title')             // "Settings"

// ✅ Functions with parameters
t('common.welcome', { name: 'Steve' })           // "Welcome, Steve!"
t('time.minutesAgo', { count: 5 })               // "5 minutes ago"
t('errors.fieldError', { field: 'Email', reason: 'Invalid format' })
```

#### Adding New Translations

1. **Check existing keys first** - Always check if the string already exists in the `common` object or other sections before adding new keys
2. **Think about context** - Consider the screen/component context when choosing the appropriate section (e.g., `settings.*`, `session.*`, `errors.*`)
3. **Add to ALL languages** - When adding new strings, you MUST add them to all language files in `sources/text/translations/` (currently: `en`, `ru`, `pl`, `es`, `ca`, `it`, `pt`, `ja`, `zh-Hans`)
4. **NEVER use smart/curly quotes** - Use only straight quotes (`"` and `'`) in translation files. Smart quotes (`\u201c` `\u201d` `\u2018` `\u2019`) are invalid JS string delimiters and break the build. This has caused repeated build failures — always verify output uses ASCII quotes.
5. **Use descriptive key names** - Use clear, hierarchical keys like `newSession.machineOffline` rather than generic names
6. **Language metadata** - All supported languages and their metadata are centralized in `sources/text/_all.ts`

#### Translation Structure
```typescript
// String constants for static text
cancel: 'Cancel',

// Functions for dynamic text with typed parameters  
welcome: ({ name }: { name: string }) => `Welcome, ${name}!`,
itemCount: ({ count }: { count: number }) => 
    count === 1 ? '1 item' : `${count} items`,
```

#### Key Sections
- `common.*` - Universal strings used across the app (buttons, actions, status)
- `settings.*` - Settings screen specific strings
- `session.*` - Session management and display
- `errors.*` - Error messages and validation
- `modals.*` - Modal dialogs and popups
- `components.*` - Component-specific strings organized by component name

#### Language Configuration

The app uses a centralized language configuration system:

- **`sources/text/_all.ts`** - Centralized language metadata including:
  - `SupportedLanguage` type definition
  - `SUPPORTED_LANGUAGES` with native names and metadata
  - Helper functions: `getLanguageNativeName()`, `getLanguageEnglishName()`
  - Language constants: `SUPPORTED_LANGUAGE_CODES`, `DEFAULT_LANGUAGE`

- **Adding new languages:**
  1. Add the language code to the `SupportedLanguage` type in `_all.ts`
  2. Add language metadata to `SUPPORTED_LANGUAGES` object
  3. Create new translation file in `sources/text/translations/[code].ts`
  4. Add import and export in `sources/text/index.ts`

#### Important Rules
- **Never hardcode strings** in JSX - always use `t('key')`
- **Dev pages exception** - Development/debug pages can skip i18n
- **Check common first** - Before adding new keys, check if a suitable translation exists in `common`
- **Context matters** - Consider where the string appears to choose the right section
- **Update all languages** - New strings must be added to every language file
- **Use centralized language names** - Import language names from `_all.ts` instead of translation keys
- **Always re-read translations** - When new strings are added, always re-read the translation files to understand the existing structure and patterns before adding new keys
- **Use translations for common strings** - Always use the translation function `t()` for any user-visible string that is translatable, especially common UI elements like buttons, labels, and messages
- **Use the i18n-translator agent** - When adding new translatable strings or verifying existing translations, use the i18n-translator agent to ensure consistency across all language files
- **Beware of technical terms** - When translating technical terms, consider:
  - Keep universally understood terms like "CLI", "API", "URL", "JSON" in their original form
  - Translate terms that have well-established equivalents in the target language
  - Use descriptive translations for complex technical concepts when direct translations don't exist
  - Maintain consistency across all technical terminology within the same language

#### i18n-Translator Agent

When working with translations, use the **i18n-translator** agent for:
- Adding new translatable strings to the application
- Verifying existing translations across all language files
- Ensuring translations are consistent and contextually appropriate
- Checking that all required languages have new strings
- Validating that translations fit the UI context (headers, buttons, multiline text)

The agent should be called whenever new user-facing text is introduced to the codebase or when translation verification is needed.

### Important Files

- `sources/sync/types.ts` - Core type definitions for the sync protocol
- `sources/sync/reducer.ts` - State management logic for sync operations
- `sources/auth/AuthContext.tsx` - Authentication state management
- `sources/app/_layout.tsx` - Root navigation structure

### Custom Header Component

The app includes a custom header component (`sources/components/Header.tsx`) that provides consistent header rendering across platforms and integrates with React Navigation.

#### Usage with React Navigation:
```tsx
import { NavigationHeader } from '@/components/Header';

// As default for all screens in Stack navigator:
<Stack
    screenOptions={{
        header: NavigationHeader,
        // Other default options...
    }}
>

// Or for individual screens:
<Stack.Screen
    name="settings"
    options={{
        header: NavigationHeader,
        headerTitle: 'Settings',
        headerSubtitle: 'Manage your preferences', // Custom extension
        headerTintColor: '#000',
        // All standard React Navigation header options are supported
    }}
/>
```

The custom header supports all standard React Navigation header options plus:
- `headerSubtitle`: Display a subtitle below the main title
- `headerSubtitleStyle`: Style object for the subtitle text

This ensures consistent header appearance and behavior across iOS, Android, and web platforms.

## Unistyles Styling Guide

### Creating Styles

Always use `StyleSheet.create` from 'react-native-unistyles':

```typescript
import { StyleSheet } from 'react-native-unistyles'
import { Text } from '@/components/ui/text/Text'

const styles = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
        paddingTop: runtime.insets.top,
        paddingHorizontal: theme.margins.md,
    },
    text: {
        color: theme.colors.text,
        fontSize: 16,
    }
}))
```

### Using Styles in Components

For React Native components, provide styles directly:

```typescript
import React from 'react'
import { View } from 'react-native'
import { StyleSheet } from 'react-native-unistyles'
import { Text } from '@/components/ui/text/Text'

const styles = StyleSheet.create((theme, runtime) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
        paddingTop: runtime.insets.top,
    },
    text: {
        color: theme.colors.text,
        fontSize: 16,
    }
}))

const MyComponent = () => {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Hello World</Text>
        </View>
    )
}
```

For other components, use `useStyles` hook:

```typescript
import React from 'react'
import { CustomComponent } from '@/components/CustomComponent'
import { useStyles } from 'react-native-unistyles'

const MyComponent = () => {
    const { styles, theme } = useStyles(styles)
    
    return (
        <CustomComponent style={styles.container} />
    )
}
```

### Variants

Create dynamic styles with variants:

```typescript
const styles = StyleSheet.create(theme => ({
    button: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        variants: {
            color: {
                primary: {
                    backgroundColor: theme.colors.primary,
                },
                secondary: {
                    backgroundColor: theme.colors.secondary,
                },
                default: {
                    backgroundColor: theme.colors.background,
                }
            },
            size: {
                small: {
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                },
                large: {
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                }
            }
        }
    }
}))

// Usage
const { styles } = useStyles(styles, {
    button: {
        color: 'primary',
        size: 'large'
    }
})
```

### Media Queries

Use media queries for responsive design:

```typescript
import { StyleSheet, mq } from 'react-native-unistyles'

const styles = StyleSheet.create(theme => ({
    container: {
        padding: theme.margins.sm,
        backgroundColor: {
            [mq.only.width(0, 768)]: theme.colors.background,
            [mq.only.width(768)]: theme.colors.secondary,
        }
    }
}))
```

### Breakpoints

Access current breakpoint in components:

```typescript
const MyComponent = () => {
    const { breakpoint } = useStyles()
    
    const isTablet = breakpoint === 'md' || breakpoint === 'lg'
    
    return (
        <View>
            {isTablet ? <TabletLayout /> : <MobileLayout />}
        </View>
    )
}
```

## Typography and Font Size

- Use `Text` / `TextInput` from `@/components/ui/text/Text` (do not import `Text` / `TextInput` from `react-native` in app UI code).
- The app supports a user-selectable in-app font size (`localSettings.uiFontSize`), which scales `fontSize`, `lineHeight`, and `letterSpacing` on these primitives and **stacks with OS Dynamic Type**.
- It’s OK to use numeric base `fontSize`/`lineHeight` in styles, but they must be rendered via the app text primitives so they scale correctly.

### Special Component Considerations

#### Expo Image
- **Size properties** (`width`, `height`) must be set outside of Unistyles stylesheet as inline styles
- **`tintColor` property** must be set directly on the component, not in style prop
- All other styling goes through Unistyles

```typescript
import { Image } from 'expo-image'
import { StyleSheet, useStyles } from 'react-native-unistyles'

const styles = StyleSheet.create((theme) => ({
    image: {
        borderRadius: 8,
        backgroundColor: theme.colors.surface, // Other styles use theme
    }
}))

const MyComponent = () => {
    const { theme } = useStyles()
    
    return (
        <Image 
            style={[{ width: 100, height: 100 }, styles.image]}  // Size as inline styles
            tintColor={theme.colors.textLink}                    // tintColor goes on component
            source={{ uri: 'https://example.com/image.jpg' }}
        />
    )
}
```

### Best Practices

1. **Always use `StyleSheet.create`** from 'react-native-unistyles'
2. **Provide styles directly** to components from 'react-native' and 'react-native-reanimated' packages
3. **Use `useStyles` hook only** for other components (but try to avoid it when possible)
4. **Always use function mode** when you need theme or runtime access
5. **Use variants** for component state-based styling instead of conditional styles
6. **Leverage breakpoints** for responsive design rather than manual dimension calculations
7. **Keep styles close to components** but extract common patterns to shared stylesheets
8. **Use TypeScript** for better developer experience and type safety

## Project Scope and Priorities

- This project targets Android, iOS, and web platforms
- Web is considered a secondary platform
- Avoid web-specific implementations unless explicitly requested
- Keep dev pages without i18n, always use t(...) function to translate all strings, when adding new string add it to all languages, think about context before translating.
- Core principles: never show loading error, always just retry. Always sync main data in "sync" class. Always use invalidate sync for it. Always use Item component first and only then you should use anything else or custom ones for content. Do not ever do backward compatibility if not explicitly stated.
- Never use custom headers in navigation, almost never use Stack.Page options in individual pages. Only when you need to show something dynamic. Always show header on all screens.
- store app pages in @sources/app/(app)/
- use ItemList for most containers for UI, if it is not custom like chat one.
- Always use expo-router api, not react-navigation one.
- Always try to use "useHappyAction" from @sources/hooks/useHappyAction.ts if you need to run some async operation, do not handle errors, etc - it is handled automatically.
- Never use unistyles for expo-image, use classical one
- Always use "Avatar" for avatars
- No backward compatibliity ever
- When non-trivial hook is needed - create a dedicated one in hooks folder, add a comment explaining it's logic
- Always put styles in the very end of the component or page file
- Always wrap pages in memo
- For hotkeys use "useGlobalKeyboard", do not change it, it works only on Web
- Use "AsyncLock" class for exclusive async locks

## Local Android Build (Self-Hosted Server)

Build and deploy a release APK for Jason's self-hosted Happier server on Android (Pixel).

### Prerequisites
- Node modules installed (`yarn install` from monorepo root)
- ADB connected to device (`adb devices`)
- Caddy reverse proxy running in Docker (`caddy-happier` container)

### Full Build Steps

```bash
cd apps/ui

# 1. Prebuild — generates android/ directory (only needed once or after native changes)
APP_ENV=preview npx expo prebuild --platform android

# 2. Post-prebuild setup (repeat after every prebuild — android/ is gitignored and regenerated)

# 2a. Bundle Caddy root CA for TLS trust
mkdir -p android/app/src/main/res/raw android/app/src/main/res/xml
docker exec caddy-happier cat /data/caddy/pki/authorities/local/root.crt \
  > android/app/src/main/res/raw/caddy_root.pem

# 2b. Create network security config
cat > android/app/src/main/res/xml/network_security_config.xml << 'XMLEOF'
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config>
        <domain includeSubdomains="false">100.94.82.56</domain>
        <trust-anchors>
            <certificates src="@raw/caddy_root"/>
            <certificates src="system"/>
        </trust-anchors>
    </domain-config>
</network-security-config>
XMLEOF

# 2c. Patch AndroidManifest.xml — add to the <application> tag:
#   android:networkSecurityConfig="@xml/network_security_config"
#   android:largeHeap="true"

# 3. Build release APK
EXPO_PUBLIC_HAPPY_SERVER_URL=https://100.94.82.56 APP_ENV=preview \
  ./android/gradlew -p android :app:assembleRelease \
  -x lint -x lintVitalRelease -x lintVitalAnalyzeRelease -x test \
  --configure-on-demand --build-cache -PreactNativeArchitectures=arm64-v8a

# 4. Install on device
adb install -r android/app/build/outputs/apk/release/app-release.apk

# 5. Force restart
adb shell am force-stop dev.happier.app.preview
adb shell monkey -p dev.happier.app.preview -c android.intent.category.LAUNCHER 1
```

### Key Details
- `APP_ENV=preview` → applicationId = `dev.happier.app.preview`
- `EXPO_PUBLIC_HAPPY_SERVER_URL` is baked into the JS bundle at build time
- `-PreactNativeArchitectures=arm64-v8a` builds only ARM64 (Pixel), much faster
- The Caddy root CA (valid until 2036) is required — without it HTTPS to the self-signed server fails
- Steps 2a-2c are lost every prebuild since `android/` is regenerated
- Server: port 443 (main), 8443 (Whisper STT), 8444 (TTS)
- For Metro dev server: `sudo sysctl fs.inotify.max_user_watches=524288`
- **`android/` is gitignored** — all changes to files inside it (MainActivity.kt, AndroidManifest.xml, etc.) are lost on every `expo prebuild`. Native customizations MUST be done via Expo config plugins, not by editing generated files directly.

## Self-Hosted Server Management

The self-hosted server stack has three components that must all be running for voice to work:

### 1. Happier Server (port 3005, proxied by Caddy on 443)

**WARNING:** `yarn service:install` builds a Bun binary with Prisma compiled for macOS. It does NOT work on Linux (throws "Prisma Client could not locate the Query Engine for runtime debian-openssl-3.0.x"). Run from source instead:

```bash
# Extract Caddy CA cert (needed for daemon TLS)
docker exec caddy-happier cat /data/caddy/pki/authorities/local/root.crt > /tmp/caddy_root.pem

# Start the light server with correct data directory
DATABASE_URL="file:/home/jason/.happier/self-host/data/happier-server-light.sqlite" \
HAPPIER_SERVER_LIGHT_DATA_DIR=/home/jason/.happier/self-host/data \
HAPPY_SERVER_LIGHT_DATA_DIR=/home/jason/.happier/self-host/data \
METRICS_PORT=0 \
nohup yarn --cwd apps/server start:light > /home/jason/.happier/self-host/logs/server-light.out.log 2>&1 &
```

If the server fails with "table does not exist", run migrations first:
```bash
DATABASE_URL="file:/home/jason/.happier/self-host/data/happier-server-light.sqlite" \
npx prisma migrate deploy --schema=apps/server/prisma/sqlite/schema.prisma
```

If port 3005 is stuck (zombie socket from crash-looped systemd service): `sudo fuser -k 3005/tcp`

### 2. CLI Daemon (voice agent RPC)

The daemon connects to the server via Socket.io and handles voice agent RPC calls. Without it, voice shows "RPC method not available".

```bash
NODE_EXTRA_CA_CERTS=/tmp/caddy_root.pem node apps/cli/dist/index.mjs daemon start-sync &
```

- **`NODE_EXTRA_CA_CERTS`** is required for the Caddy self-signed cert. `NODE_TLS_REJECT_UNAUTHORIZED=0` does NOT work for Socket.io.
- If credentials are lost, re-authenticate: `NODE_TLS_REJECT_UNAUTHORIZED=0 node apps/cli/dist/index.mjs auth login`
- **Never kill the daemon blindly** — it holds the socket registration with the server. Restarting requires the server to be up and credentials to be valid.
- Check daemon logs: `ls -t ~/.happier/logs/*daemon*.log | head -1 | xargs tail -20`

### 3. STT + TTS Servers (ports 8443 and 8444)

These run separately (Docker or native). Verify they're up:
```bash
ss -tlnp sport = :8443  # Whisper STT
ss -tlnp sport = :8444  # TTS
```

### Voice App Settings
- STT base URL: `https://100.94.82.56:8443`
- STT model: `deepdml/faster-whisper-large-v3-turbo-ct2`
- TTS base URL: `https://100.94.82.56:8444`

### Rebuilding & Restarting the Daemon

The CLI daemon runs from compiled JS (`apps/cli/dist/`). Changes to these packages are **not picked up** until you rebuild and restart:

- `packages/protocol` — action specs, action IDs, schemas (e.g. adding voice tools)
- `packages/agents` — voice agent prompt builder, agent utilities
- `apps/cli` — daemon code, RPC handlers, agent backends

**When to do this:** Any time you modify protocol action specs, voice agent prompts, RPC handlers, or daemon-side logic. The voice agent's system prompt is built from protocol specs at daemon startup — new tools won't appear until the daemon restarts with rebuilt code.

```bash
# 1. Rebuild the dependency chain
yarn --cwd packages/protocol build
yarn --cwd packages/agents build
yarn --cwd apps/cli build

# 2. Kill the running daemon
kill $(pgrep -f "daemon start-sync")

# 3. Restart with Caddy CA for TLS
sleep 2
NODE_EXTRA_CA_CERTS=/tmp/caddy_root.pem nohup node apps/cli/dist/index.mjs daemon start-sync > /dev/null 2>&1 &
```

If `/tmp/caddy_root.pem` is missing, extract it first:
```bash
docker exec caddy-happier cat /data/caddy/pki/authorities/local/root.crt > /tmp/caddy_root.pem
```

### Startup Order
1. Caddy (Docker) — usually always running
2. Happier server (from source, see above)
3. CLI daemon (with `NODE_EXTRA_CA_CERTS`)
4. STT + TTS servers
