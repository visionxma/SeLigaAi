import '../polyfills';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ImageBackground, StyleSheet, useWindowDimensions } from 'react-native';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    // Simula carregamento da splash por 2 segundos
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // Mostra a splash enquanto não estiver pronto
  if (!isReady) {
    return (
      <View style={styles.container}>
        <ImageBackground
          source={require('@/assets/images/splash.png')}
          style={[styles.image, { width, height }]}
          resizeMode="cover"
        >
          <View style={styles.overlay} />
        </ImageBackground>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});