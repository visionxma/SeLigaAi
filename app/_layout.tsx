import '../polyfills';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';

// Previne auto-hide
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    // Esconde a splash nativa IMEDIATAMENTE para mostrar sua tela customizada
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <Stack
        screenOptions={{ headerShown: false }}
        initialRouteName="splash"  // ✅ Mantém splash como inicial
      >
        <Stack.Screen name="splash" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}