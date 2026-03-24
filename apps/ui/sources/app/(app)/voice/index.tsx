import * as React from 'react';
import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text } from '@/components/ui/text/Text';
import { VoiceBars } from '@/components/ui/status/VoiceBars';
import { useVoiceSessionSnapshot, voiceSessionManager } from '@/voice/session/voiceSession';
import { fireAndForget } from '@/utils/system/fireAndForget';

export default memo(function VoiceOverlayScreen() {
  const { theme } = useUnistyles();
  const snap = useVoiceSessionSnapshot();
  const startedRef = React.useRef(false);

  // Auto-start voice agent on mount.
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fireAndForget(voiceSessionManager.toggle(''), { tag: 'VoiceOverlay.autoStart' });
  }, []);

  // Auto-stop voice agent when leaving.
  React.useEffect(() => {
    return () => {
      fireAndForget(voiceSessionManager.stop(''), { tag: 'VoiceOverlay.autoStop' });
    };
  }, []);

  const dismiss = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const modeLabel = (() => {
    switch (snap.mode) {
      case 'listening': return 'Listening...';
      case 'transcribing': return 'Transcribing...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      default:
        if (snap.status === 'connected') return 'Ready';
        if (snap.status === 'connecting') return 'Connecting...';
        return 'Starting...';
    }
  })();

  return (
    <Pressable style={styles.backdrop} onPress={dismiss}>
      <Pressable style={[styles.card, { backgroundColor: theme.colors.groupped.background }]} onPress={(e) => e.stopPropagation()}>
        <View style={styles.indicator}>
          {snap.mode === 'speaking' ? (
            <VoiceBars size={48} color={theme.colors.primary} />
          ) : snap.mode === 'listening' ? (
            <Ionicons name="mic" size={48} color={theme.colors.primary} />
          ) : (
            <Ionicons name="ellipsis-horizontal-circle" size={48} color={theme.colors.textSecondary} />
          )}
        </View>
        <Text style={[styles.label, { color: theme.colors.text }]}>{modeLabel}</Text>
        <Pressable style={[styles.closeButton, { backgroundColor: theme.colors.destructive }]} onPress={dismiss}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </Pressable>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    width: 240,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },
  indicator: {
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
});
