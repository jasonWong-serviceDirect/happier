import React from 'react';
import { View, Pressable, ActivityIndicator, InteractionManager } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CommonActions, useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/ui/layout/layout';
import { t } from '@/text';
import { ItemList } from '@/components/ui/lists/ItemList';
import { ItemGroup } from '@/components/ui/lists/ItemGroup';
import { Item } from '@/components/ui/lists/Item';
import { MultiTextInput, type MultiTextInputHandle } from '@/components/ui/forms/MultiTextInput';
import type { AgentId } from '@/agents/catalog/catalog';
import { DEFAULT_AGENT_ID, getAgentCore, isAgentId } from '@/agents/catalog/catalog';
import { getClipboardStringTrimmedSafe } from '@/utils/ui/clipboard';
import { Text } from '@/components/ui/text/Text';
import { useHappyAction } from '@/hooks/ui/useHappyAction';
import { machineNativeSessionsList, type MachineNativeSessionsListResult } from '@/sync/ops/machineNativeSessions';
import type { NativeSessionEntry, NativeSessionProjectDirSummary } from '@happier-dev/protocol';


/**
 * Resume picker screen.
 *
 * Phase 1: shows a project directory list fetched from the daemon.
 * Phase 2: when a project is selected, shows sessions for that project.
 * A manual text input fallback is always available at the bottom.
 *
 * If the daemon is too old (method not found), only the manual input is shown.
 */
export default React.memo(function ResumePickerScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const navigation = useNavigation();
    const inputRef = React.useRef<MultiTextInputHandle>(null);
    const params = useLocalSearchParams<{
        currentResumeId?: string;
        agentType?: AgentId;
        machineId?: string;
        serverId?: string;
    }>();

    const [inputValue, setInputValue] = React.useState(params.currentResumeId || '');
    const agentType: AgentId = isAgentId(params.agentType) ? params.agentType : DEFAULT_AGENT_ID;
    const agentLabel = t(getAgentCore(agentType).displayNameKey);
    const machineId = params.machineId ?? '';
    const serverId = params.serverId;

    // --- Browser state ---
    const [projectDirs, setProjectDirs] = React.useState<readonly NativeSessionProjectDirSummary[]>([]);
    const [selectedProject, setSelectedProject] = React.useState<string | null>(null);
    const [sessions, setSessions] = React.useState<readonly NativeSessionEntry[]>([]);
    const [loadingProjects, setLoadingProjects] = React.useState(false);
    const [loadingSessions, setLoadingSessions] = React.useState(false);
    const [unsupported, setUnsupported] = React.useState(false);
    const [manualExpanded, setManualExpanded] = React.useState(false);

    // --- Format relative time ---
    const formatRelativeTime = React.useCallback((ms: number): string => {
        const seconds = Math.floor((Date.now() - ms) / 1000);
        if (seconds < 60) return t('time.justNow');
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return t('time.minutesAgo', { count: minutes });
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return t('time.hoursAgo', { count: hours });
        const days = Math.floor(hours / 24);
        return t('time.daysAgo', { count: days });
    }, []);

    // --- Shorten a path by stripping the home dir prefix ---
    const shortenPath = React.useCallback((dir: string): string => {
        // Replace /home/<user>/ or /Users/<user>/ with ~/
        return dir.replace(/^\/(?:home|Users)\/[^/]+\//, '~/');
    }, []);

    // --- Save and navigate back ---
    const setParentResumeAndPath = React.useCallback((sessionId: string, projectDir?: string) => {
        const state = navigation.getState();
        if (!state) {
            router.back();
            return;
        }
        const previousRoute = state.routes[state.index - 1];
        if (previousRoute) {
            const paramsToSet: Record<string, string> = { resumeSessionId: sessionId };
            if (projectDir) {
                paramsToSet.path = projectDir;
            }
            navigation.dispatch({
                ...CommonActions.setParams(paramsToSet),
                source: previousRoute.key,
            } as never);
        }
        router.back();
    }, [navigation, router]);

    const handleSave = React.useCallback(() => {
        setParentResumeAndPath(inputValue.trim());
    }, [inputValue, setParentResumeAndPath]);

    const handleClear = React.useCallback(() => {
        setParentResumeAndPath('');
    }, [setParentResumeAndPath]);

    const handlePaste = React.useCallback(async () => {
        const text = await getClipboardStringTrimmedSafe();
        if (text) {
            setInputValue(text);
        }
    }, []);

    // --- Fetch project list on mount ---
    const [_projectsLoading, doLoadProjects] = useHappyAction(React.useCallback(async () => {
        if (!machineId) return;
        setLoadingProjects(true);
        try {
            const result: MachineNativeSessionsListResult = await machineNativeSessionsList(
                machineId,
                undefined,
                { serverId: serverId ?? null },
            );
            if (!result.ok) {
                if ('supported' in result && result.supported === false) {
                    setUnsupported(true);
                    setManualExpanded(true);
                }
                return;
            }
            setProjectDirs(result.projectDirs);
        } finally {
            setLoadingProjects(false);
        }
    }, [machineId, serverId]));

    React.useEffect(() => {
        if (machineId) {
            doLoadProjects();
        } else {
            // No machine selected, show only manual input
            setManualExpanded(true);
        }
    }, [machineId, doLoadProjects]);

    // --- Fetch sessions for a selected project ---
    const [_sessionsLoading, doLoadSessions] = useHappyAction(React.useCallback(async () => {
        if (!machineId || !selectedProject) return;
        setLoadingSessions(true);
        try {
            const result = await machineNativeSessionsList(
                machineId,
                { projectDir: selectedProject },
                { serverId: serverId ?? null },
            );
            if (!result.ok) return;
            setSessions(result.sessions);
        } finally {
            setLoadingSessions(false);
        }
    }, [machineId, selectedProject, serverId]));

    React.useEffect(() => {
        if (selectedProject) {
            doLoadSessions();
        }
    }, [selectedProject, doLoadSessions]);

    // --- Select a session from the browser ---
    const handleSelectSession = React.useCallback((session: NativeSessionEntry) => {
        setParentResumeAndPath(session.sessionId, session.projectDir);
    }, [setParentResumeAndPath]);

    // --- Navigate back from session list to project list ---
    const handleBackToProjects = React.useCallback(() => {
        setSelectedProject(null);
        setSessions([]);
    }, []);

    // --- Auto-focus for manual input ---
    const focusInputWithRetries = React.useCallback(() => {
        let cancelled = false;
        const focus = () => {
            if (cancelled) return;
            inputRef.current?.focus();
        };
        focus();

        let rafAttempts = 0;
        const raf =
            typeof (globalThis as any).requestAnimationFrame === 'function'
                ? ((globalThis as any).requestAnimationFrame as (cb: (ts: number) => void) => any).bind(globalThis)
                : (cb: (ts: number) => void) => setTimeout(() => cb(Date.now()), 16);
        const caf =
            typeof (globalThis as any).cancelAnimationFrame === 'function'
                ? ((globalThis as any).cancelAnimationFrame as (id: any) => void).bind(globalThis)
                : (id: any) => clearTimeout(id);
        let rafId: any = null;
        const rafLoop = () => {
            rafAttempts += 1;
            focus();
            if (rafAttempts < 8) {
                rafId = raf(rafLoop);
            }
        };
        rafId = raf(rafLoop);
        const timer = setTimeout(focus, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (rafId !== null) caf(rafId);
        };
    }, []);

    // Only auto-focus when manual section is expanded
    React.useEffect(() => {
        if (!manualExpanded) return;
        const cleanup = focusInputWithRetries();
        return cleanup;
    }, [manualExpanded, focusInputWithRetries]);

    useFocusEffect(React.useCallback(() => {
        if (!manualExpanded) return;
        const cleanup = focusInputWithRetries();
        let interactionCleanup: (() => void) | undefined;
        const task = InteractionManager.runAfterInteractions(() => {
            interactionCleanup = focusInputWithRetries();
        });
        return () => {
            task.cancel?.();
            interactionCleanup?.();
            cleanup();
        };
    }, [manualExpanded, focusInputWithRetries]));

    const headerTitle = t('newSession.resume.pickerTitle');
    const headerBackTitle = t('common.cancel');
    const screenOptions = React.useMemo(() => ({
        headerShown: true,
        title: headerTitle,
        headerTitle,
        headerBackTitle,
    } as const), [headerBackTitle, headerTitle]);

    // --- Render ---
    const showBrowser = !unsupported && machineId.length > 0;

    return (
        <>
            <Stack.Screen options={screenOptions} />
            <View style={styles.container}>
                <ItemList>
                    {/* Project / Session browser */}
                    {showBrowser && !selectedProject && (
                        <ItemGroup title={t('newSession.resume.projectsTitle')}>
                            {loadingProjects ? (
                                <View style={styles.loadingRow}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                    <Text style={styles.loadingText}>
                                        {t('newSession.resume.loadingProjects')}
                                    </Text>
                                </View>
                            ) : projectDirs.length === 0 ? (
                                <View style={styles.emptyRow}>
                                    <Text style={styles.emptyText}>
                                        {t('newSession.resume.noSessions')}
                                    </Text>
                                </View>
                            ) : (
                                projectDirs.map((dir) => (
                                    <Item
                                        key={dir.dir}
                                        title={shortenPath(dir.dir)}
                                        subtitle={formatRelativeTime(dir.latestMtimeMs)}
                                        detail={String(dir.sessionCount)}
                                        onPress={() => setSelectedProject(dir.dir)}
                                    />
                                ))
                            )}
                        </ItemGroup>
                    )}

                    {showBrowser && selectedProject && (
                        <ItemGroup
                            title={t('newSession.resume.sessionsTitle', {
                                project: shortenPath(selectedProject),
                            })}
                        >
                            <Item
                                title={t('common.back')}
                                icon={<Ionicons name="chevron-back" size={18} color={theme.colors.accent.blue} />}
                                onPress={handleBackToProjects}
                                showChevron={false}
                            />
                            {loadingSessions ? (
                                <View style={styles.loadingRow}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                    <Text style={styles.loadingText}>
                                        {t('newSession.resume.loadingSessions')}
                                    </Text>
                                </View>
                            ) : sessions.length === 0 ? (
                                <View style={styles.emptyRow}>
                                    <Text style={styles.emptyText}>
                                        {t('newSession.resume.noSessions')}
                                    </Text>
                                </View>
                            ) : (
                                sessions.map((session) => (
                                    <Item
                                        key={session.sessionId}
                                        title={session.lastPrompt
                                            ? (session.lastPrompt.length > 80
                                                ? session.lastPrompt.slice(0, 80) + '...'
                                                : session.lastPrompt)
                                            : session.sessionId}
                                        subtitle={formatRelativeTime(session.mtimeMs)}
                                        rightElement={session.isActive ? (
                                            <View style={styles.activeBadge}>
                                                <Text style={styles.activeBadgeText}>
                                                    {t('newSession.resume.active')}
                                                </Text>
                                            </View>
                                        ) : undefined}
                                        onPress={() => handleSelectSession(session)}
                                    />
                                ))
                            )}
                        </ItemGroup>
                    )}

                    {/* Unsupported daemon notice */}
                    {unsupported && (
                        <ItemGroup>
                            <View style={styles.emptyRow}>
                                <Text style={styles.emptyText}>
                                    {t('newSession.resume.unsupported')}
                                </Text>
                            </View>
                        </ItemGroup>
                    )}

                    {/* Manual entry section */}
                    <ItemGroup>
                        {!manualExpanded ? (
                            <Item
                                title={t('newSession.resume.manualEntry')}
                                icon={<Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />}
                                onPress={() => setManualExpanded(true)}
                            />
                        ) : (
                            <View style={styles.inputSection}>
                                <Text style={styles.inputLabel}>
                                    {t('newSession.resume.subtitle', { agent: agentLabel })}
                                </Text>

                                <View style={styles.inputContainer}>
                                    <MultiTextInput
                                        ref={inputRef}
                                        value={inputValue}
                                        onChangeText={setInputValue}
                                        placeholder={
                                            t('newSession.resume.placeholder', { agent: agentLabel })
                                        }
                                        autoFocus={true}
                                        maxHeight={80}
                                        paddingTop={0}
                                        paddingBottom={0}
                                    />
                                </View>

                                <View style={styles.buttonRow}>
                                    <Pressable
                                        onPress={handlePaste}
                                        style={({ pressed }) => [
                                            styles.button,
                                            styles.buttonSecondary,
                                            { opacity: pressed ? 0.7 : 1 },
                                        ]}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Ionicons name="clipboard-outline" size={18} color={theme.colors.text} />
                                            <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                                                {t('newSession.resume.paste')}
                                            </Text>
                                        </View>
                                    </Pressable>
                                    <Pressable
                                        onPress={handleSave}
                                        style={({ pressed }) => [
                                            styles.button,
                                            styles.buttonPrimary,
                                            { opacity: pressed ? 0.7 : 1 },
                                        ]}
                                    >
                                        <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
                                            {t('newSession.resume.save')}
                                        </Text>
                                    </Pressable>
                                </View>

                                {inputValue.trim() && (
                                    <Pressable
                                        onPress={handleClear}
                                        style={({ pressed }) => [
                                            styles.clearButton,
                                            { opacity: pressed ? 0.7 : 1 },
                                        ]}
                                    >
                                        <Text style={styles.clearButtonText}>
                                            {t('newSession.resume.clearAndRemove')}
                                        </Text>
                                    </Pressable>
                                )}

                                <Text style={styles.helpText}>
                                    {t('newSession.resume.helpText')}
                                </Text>
                            </View>
                        )}
                    </ItemGroup>
                </ItemList>
            </View>
        </>
    );
});


const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 16,
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    loadingText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    emptyRow: {
        padding: 16,
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    emptyText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default(),
        textAlign: 'center',
    },
    activeBadge: {
        backgroundColor: theme.colors.accent.green,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    activeBadgeText: {
        fontSize: 12,
        color: theme.colors.button.primary.tint,
        ...Typography.default('semiBold'),
    },
    inputSection: {
        padding: 16,
        alignSelf: 'center',
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    inputLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 8,
        ...Typography.default('semiBold'),
    },
    inputContainer: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 0.5,
        borderColor: theme.colors.divider,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPrimary: {
        backgroundColor: theme.colors.button.primary.background,
    },
    buttonSecondary: {
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: theme.colors.divider,
    },
    buttonText: {
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
    buttonTextPrimary: {
        color: theme.colors.button.primary.tint,
    },
    buttonTextSecondary: {
        color: theme.colors.text,
    },
    clearButton: {
        marginTop: 12,
        paddingVertical: 12,
        alignItems: 'center',
    },
    clearButtonText: {
        fontSize: 15,
        color: theme.colors.textDestructive,
        ...Typography.default('semiBold'),
    },
    helpText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 12,
        lineHeight: 20,
        ...Typography.default(),
    },
}));
