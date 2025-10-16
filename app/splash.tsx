import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Waves } from 'lucide-react-native';

export default function SplashScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Inicia as animações
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Navega para as tabs após 2.5 segundos
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Gradiente de fundo simulado com overlays */}
      <View style={styles.gradientOverlay} />
      
      {/* Círculos decorativos de fundo */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      
      <Animated.View 
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }]
          }
        ]}
      >
        {/* Ícone principal com destaque */}
        <View style={styles.iconContainer}>
          <View style={styles.iconGlow} />
          <AlertTriangle size={80} color="#FFFFFF" strokeWidth={2.5} />
        </View>
        
        {/* Título */}
        <Text style={styles.title}>SE LIGA AÍ</Text>
        
        {/* Subtítulo */}
        <Text style={styles.subtitle}>
          Alertas de enchente em tempo real
        </Text>
        
        {/* Ícone de ondas decorativo */}
        <View style={styles.wavesContainer}>
          <Waves size={24} color="#3B82F6" strokeWidth={2} />
        </View>
        
        {/* Footer com créditos */}
        <View style={styles.footer}>
          <View style={styles.divider} />
          <Text style={styles.developer}>Desenvolvido por</Text>
          <Text style={styles.company}>VISIONX</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1E293B',
    opacity: 0.8,
  },
  circle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#EF4444',
    opacity: 0.1,
    top: -100,
    right: -100,
  },
  circle2: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#3B82F6',
    opacity: 0.1,
    bottom: -80,
    left: -80,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    gap: 16,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EF4444',
    opacity: 0.2,
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
    textShadowColor: 'rgba(239, 68, 68, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '500',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  wavesContainer: {
    marginTop: 8,
    opacity: 0.6,
  },
  footer: {
    marginTop: 60,
    alignItems: 'center',
    gap: 8,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: '#334155',
    marginBottom: 8,
  },
  developer: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '400',
    letterSpacing: 1,
  },
  company: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 3,
  },
});