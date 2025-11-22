import { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert, Modal, ScrollView, Pressable } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MapPin, Navigation, RefreshCw, Cloud, BellOff, X, MapPinned } from 'lucide-react-native';
import { AlertPoint } from '@/types';
import { getAllAlertPoints } from '@/services/storageService';
import { startLocationTracking, requestLocationPermissions } from '@/services/locationService';
import { 
  registerForPushNotificationsAsync, 
  isNotificationsMuted, 
  getMutedTimeRemaining,
  dismissAllActiveNotifications,
  clearInsideZones,
} from '@/services/notificationService';
import { syncAlertPointsFromSheets, isSheetsConfigured } from '@/services/sheetsService';
import { useFocusEffect } from '@react-navigation/native';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [alertPoints, setAlertPoints] = useState<AlertPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [mutedTimeRemaining, setMutedTimeRemaining] = useState<number | null>(null);
  const [showAlertsList, setShowAlertsList] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [currentCity, setCurrentCity] = useState<string>('');
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkNotificationStatus();
    }, [])
  );

  async function checkNotificationStatus() {
    const muted = await isNotificationsMuted();
    setNotificationsMuted(muted);

    const timeRemaining = await getMutedTimeRemaining();
    setMutedTimeRemaining(timeRemaining);
  }

  async function initializeApp() {
    try {
      await registerForPushNotificationsAsync();
      await dismissAllActiveNotifications();
      await clearInsideZones();

      const hasPermissions = await requestLocationPermissions();

      if (!hasPermissions) {
        Alert.alert(
          'Permissão necessária',
          'Este app precisa de permissão de localização para funcionar.'
        );
        setLoading(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);

      // Obtém a cidade atual através de geocoding reverso
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });
        if (address?.city) {
          setCurrentCity(address.city);
          console.log('Current city:', address.city);
        }
      } catch (error) {
        console.error('Error getting current city:', error);
      }

      if (isSheetsConfigured()) {
        console.log('Syncing from Google Sheets...');
        const synced = await syncAlertPointsFromSheets();
        if (synced) {
          console.log('Successfully synced from Google Sheets');
        }
      }

      await loadAlertPoints();

      const started = await startLocationTracking();
      setTracking(started);

      await checkNotificationStatus();

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      Alert.alert('Erro', 'Erro ao inicializar o app. Verifique as permissões.');
      setLoading(false);
    }
  }

  async function loadAlertPoints() {
    try {
      const points = await getAllAlertPoints();
      setAlertPoints(points);
      console.log(`Loaded ${points.length} alert points`);
    } catch (error) {
      console.error('Error loading alert points:', error);
    }
  }

  async function handleSyncFromSheets() {
    if (!isSheetsConfigured()) {
      Alert.alert(
        'Google Sheets não configurado',
        'Configure o ID da planilha no arquivo sheetsService.ts'
      );
      return;
    }

    setSyncing(true);
    try {
      const synced = await syncAlertPointsFromSheets();
      
      if (synced) {
        await loadAlertPoints();
        
        if (webViewRef.current) {
          webViewRef.current.reload();
        }
        
        Alert.alert('Sucesso', 'Pontos de alerta sincronizados do Google Sheets!');
      } else {
        Alert.alert('Aviso', 'Nenhum ponto encontrado na planilha.');
      }
    } catch (error) {
      console.error('Error syncing from sheets:', error);
      Alert.alert('Erro', 'Falha ao sincronizar. Verifique sua conexão e se a planilha está pública.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleRefresh() {
    try {
      if (isSheetsConfigured()) {
        setSyncing(true);
        await syncAlertPointsFromSheets();
        setSyncing(false);
      }
      
      await loadAlertPoints();
      await checkNotificationStatus();
      
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation);

      // Atualiza cidade atual
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });
        if (address?.city) {
          setCurrentCity(address.city);
        }
      } catch (error) {
        console.error('Error getting current city:', error);
      }
      
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          if (window.updateUserLocation) {
            window.updateUserLocation(${currentLocation.coords.latitude}, ${currentLocation.coords.longitude});
          }
        `);
      }
      
      Alert.alert('Atualizado', 'Dados atualizados com sucesso!');
    } catch (error) {
      console.error('Error refreshing:', error);
      Alert.alert('Erro', 'Erro ao atualizar dados');
    }
  }

  function centerOnUserLocation() {
    if (location && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.centerOnUser) {
          window.centerOnUser();
        }
      `);
    }
  }

  function formatTimeRemaining(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return `${days}d`;
    }
    return `${hours}h${mins > 0 ? `${mins}m` : ''}`;
  }

  // Função para obter cidades únicas
  function getUniqueCities(): string[] {
    const cities = alertPoints.map(point => point.city);
    return Array.from(new Set(cities)).sort();
  }

  // Contar alertas na cidade atual
  function getAlertsInCurrentCity(): number {
    if (!currentCity) return 0;
    return alertPoints.filter(point => 
      point.city.toLowerCase() === currentCity.toLowerCase()
    ).length;
  }

  // Filtrar pontos de alerta
  function getFilteredAlertPoints(): AlertPoint[] {
    let filtered = alertPoints;

    // Filtrar por cidade
    if (selectedCity !== 'all') {
      filtered = filtered.filter(point => point.city === selectedCity);
    }

    return filtered;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        #map { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        const map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([${location?.coords.latitude || -4.5667}, ${location?.coords.longitude || -44.6}], 15);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        const userIcon = L.divIcon({
          className: 'user-marker',
          html: '<div style="width: 20px; height: 20px; background: #EF4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        let userMarker = L.marker([${location?.coords.latitude || -4.5667}, ${location?.coords.longitude || -44.6}], { icon: userIcon }).addTo(map);

        const alertPoints = ${JSON.stringify(alertPoints)};
        
        alertPoints.forEach(point => {
          L.circle([point.latitude, point.longitude], {
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 0.2,
            radius: point.radius,
            weight: 2
          }).addTo(map);

          const marker = L.marker([point.latitude, point.longitude], {
            icon: L.divIcon({
              className: 'alert-marker',
              html: '<div style="width: 30px; height: 30px; background: #EF4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-size: 18px;">⚠️</span></div>',
              iconSize: [30, 30],
              iconAnchor: [15, 15]
            })
          }).addTo(map);

          marker.bindPopup(\`
            <div style="font-family: Arial; padding: 8px;">
              <strong style="color: #EF4444; font-size: 14px;">\${point.alert_type}</strong><br/>
              <span style="font-size: 12px; color: #333;">\${point.street}, \${point.city}</span>
            </div>
          \`);
        });

        window.updateUserLocation = (lat, lng) => {
          userMarker.setLatLng([lat, lng]);
          map.setView([lat, lng]);
        };

        window.centerOnUser = () => {
          map.setView(userMarker.getLatLng(), 15);
        };
      </script>
    </body>
    </html>
  `;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  const uniqueCities = getUniqueCities();
  const filteredAlerts = getFilteredAlertPoints();
  const alertsInCurrentCity = getAlertsInCurrentCity();

  return (
    <View style={styles.container}>
      {location && (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={['*']}
        />
      )}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>SE LIGA AÍ</Text>
        <View style={styles.headerBadges}>
          {tracking && (
            <View style={styles.trackingBadge}>
              <View style={styles.trackingDot} />
              <Text style={styles.trackingText}>Monitorando</Text>
            </View>
          )}
          {notificationsMuted && (
            <View style={styles.mutedBadge}>
              <BellOff size={12} color="#EF4444" />
              <Text style={styles.mutedText}>
                {mutedTimeRemaining ? formatTimeRemaining(mutedTimeRemaining) : 'Silenciado'}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={centerOnUserLocation}
          activeOpacity={0.7}
        >
          <Navigation size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, syncing && styles.controlButtonDisabled]}
          onPress={handleSyncFromSheets}
          activeOpacity={0.7}
          disabled={syncing}
        >
          <Cloud size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <RefreshCw size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsContainer}>
        <TouchableOpacity 
          style={styles.statCard}
          onPress={() => setShowAlertsList(true)}
          activeOpacity={0.7}
        >
          <MapPin size={20} color="#EF4444" />
          <Text style={styles.statNumber}>{alertPoints.length}</Text>
          <Text style={styles.statLabel}>Pontos de Alerta</Text>
        </TouchableOpacity>

        {currentCity && alertsInCurrentCity > 0 && (
          <View style={styles.currentCityCard}>
            <MapPinned size={18} color="#10B981" />
            <View style={styles.currentCityInfo}>
              <Text style={styles.currentCityNumber}>{alertsInCurrentCity}</Text>
              <Text style={styles.currentCityLabel}>em {currentCity}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.bottomBadges}>
        <View style={styles.osmBadge}>
          <Text style={styles.osmText}>🗺️ OpenStreetMap</Text>
        </View>
      </View>

      {/* Modal de Lista de Alertas */}
      <Modal
        visible={showAlertsList}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAlertsList(false)}
      >
        <View style={styles.modalContainer}>
          {/* Header do Modal */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderContent}>
              <MapPin size={28} color="#EF4444" />
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Pontos de Alerta</Text>
                <Text style={styles.modalSubtitle}>
                  {filteredAlerts.length} {filteredAlerts.length === 1 ? 'ponto' : 'pontos'}
                  {selectedCity !== 'all' && ` em ${selectedCity}`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowAlertsList(false)}
              style={styles.closeButton}
            >
              <X size={28} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Filtros por Cidade */}
          <View style={styles.filtersContainer}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.cityFilters}
              contentContainerStyle={styles.cityFiltersContent}
            >
              <TouchableOpacity
                style={[
                  styles.cityFilterButton,
                  selectedCity === 'all' && styles.cityFilterButtonActive
                ]}
                onPress={() => setSelectedCity('all')}
              >
                <Text style={[
                  styles.cityFilterText,
                  selectedCity === 'all' && styles.cityFilterTextActive
                ]}>
                  Todas as Cidades
                </Text>
                <View style={styles.cityFilterBadge}>
                  <Text style={[
                    styles.cityFilterBadgeText,
                    selectedCity === 'all' && styles.cityFilterBadgeTextActive
                  ]}>
                    {alertPoints.length}
                  </Text>
                </View>
              </TouchableOpacity>

              {uniqueCities.map(city => {
                const count = alertPoints.filter(p => p.city === city).length;
                const isCurrentCity = city.toLowerCase() === currentCity.toLowerCase();
                
                return (
                  <TouchableOpacity
                    key={city}
                    style={[
                      styles.cityFilterButton,
                      selectedCity === city && styles.cityFilterButtonActive,
                      isCurrentCity && styles.cityFilterButtonCurrent
                    ]}
                    onPress={() => setSelectedCity(city)}
                  >
                    {isCurrentCity && <MapPinned size={14} color={selectedCity === city ? "#10B981" : "#6B7280"} />}
                    <Text style={[
                      styles.cityFilterText,
                      selectedCity === city && styles.cityFilterTextActive
                    ]}>
                      {city}
                    </Text>
                    <View style={styles.cityFilterBadge}>
                      <Text style={[
                        styles.cityFilterBadgeText,
                        selectedCity === city && styles.cityFilterBadgeTextActive
                      ]}>
                        {count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Lista de Alertas - CORRIGIDO */}
          <View style={styles.alertsListWrapper}>
            <ScrollView 
              style={styles.alertsList}
              contentContainerStyle={styles.alertsListContent}
              scrollEnabled={true}
              nestedScrollEnabled={true}
            >
              {filteredAlerts.length === 0 ? (
                <View style={styles.emptyState}>
                  <MapPin size={64} color="#D1D5DB" />
                  <Text style={styles.emptyStateTitle}>Nenhum ponto encontrado</Text>
                  <Text style={styles.emptyStateText}>
                    Não há pontos de alerta registrados nesta cidade
                  </Text>
                </View>
              ) : (
                filteredAlerts.map((alert) => {
                  const isInCurrentCity = alert.city.toLowerCase() === currentCity.toLowerCase();
                  
                  return (
                    <View 
                      key={alert.id} 
                      style={[
                        styles.alertCard,
                        isInCurrentCity && styles.alertCardCurrent
                      ]}
                    >
                      <View style={styles.alertCardHeader}>
                        <View style={styles.alertTypeContainer}>
                          <View style={styles.alertIcon}>
                            <Text style={styles.alertIconText}>⚠️</Text>
                          </View>
                          <View style={styles.alertInfo}>
                            <View style={styles.alertTypeRow}>
                              <Text style={styles.alertType}>{alert.alert_type}</Text>
                              {isInCurrentCity && (
                                <View style={styles.currentLocationBadge}>
                                  <MapPinned size={12} color="#10B981" />
                                  <Text style={styles.currentLocationText}>Sua área</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.alertCity}>{alert.city}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.alertCardBody}>
                        <Text style={styles.alertStreet}>📍 {alert.street}</Text>
                        <Text style={styles.alertRadius}>Raio de alerta: {alert.radius}m</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    fontSize: 18,
    color: '#1F2937',
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#EF4444',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  headerBadges: {
    gap: 8,
  },
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  trackingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  trackingText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '600',
  },
  mutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  mutedText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    gap: 12,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  controlButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  statsContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    gap: 12,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  currentCityCard: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  currentCityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currentCityNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10B981',
  },
  currentCityLabel: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  bottomBadges: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    gap: 8,
    alignItems: 'flex-end',
  },
  osmBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  osmText: {
    color: '#1F2937',
    fontSize: 10,
    fontWeight: '600',
  },
  // Estilos do Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  cityFilters: {
    paddingHorizontal: 20,
  },
  cityFiltersContent: {
    gap: 8,
  },
  cityFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cityFilterButtonActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  cityFilterButtonCurrent: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  cityFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  cityFilterTextActive: {
    color: '#EF4444',
  },
  cityFilterBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  cityFilterBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  cityFilterBadgeTextActive: {
    color: '#EF4444',
  },
  alertsListWrapper: {
    flex: 1,
  },
  alertsList: {
    flex: 1,
  },
  alertsListContent: {
    padding: 20,
    gap: 12,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  alertCardCurrent: {
    borderLeftColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertIconText: {
    fontSize: 20,
  },
  alertInfo: {
    flex: 1,
  },
  alertTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  alertType: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
  },
  currentLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  currentLocationText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  alertCity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 2,
  },
  alertCardBody: {
    gap: 6,
  },
  alertStreet: {
    fontSize: 14,
    color: '#4B5563',
  },
  alertRadius: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});