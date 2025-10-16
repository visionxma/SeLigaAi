import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const OFFLINE_TILES_KEY = 'offline_tiles_downloaded';

// Usa as constantes corretamente - elas existem mas como propriedades do módulo
const getTilesDir = () => {
  if (FileSystem.cacheDirectory) {
    return `${FileSystem.cacheDirectory}tiles/`;
  }
  if (FileSystem.documentDirectory) {
    return `${FileSystem.documentDirectory}tiles/`;
  }
  throw new Error('No directory available');
};

// Coordenadas das cidades do Maranhão
const REGIONS = {
  pedreiras: {
    name: 'Pedreiras',
    lat: -4.5667,
    lng: -44.6,
    bounds: {
      north: -4.4667,
      south: -4.6667,
      east: -44.5,
      west: -44.7,
    },
  },
  trizidelaDovale: {
    name: 'Trizidela do Vale',
    lat: -4.9833,
    lng: -44.6667,
    bounds: {
      north: -4.8833,
      south: -5.0833,
      east: -44.5667,
      west: -44.7667,
    },
  },
};

// Níveis de zoom a baixar (13-17 são bons para cidades)
const ZOOM_LEVELS = [13, 14, 15, 16, 17];

interface TileCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Converte lat/lng para coordenadas de tile
 */
function latLngToTile(lat: number, lng: number, zoom: number): TileCoord {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  return { x, y, z: zoom };
}

/**
 * Gera lista de tiles para uma região específica
 */
function getTilesForRegion(bounds: any, zoom: number): TileCoord[] {
  const topLeft = latLngToTile(bounds.north, bounds.west, zoom);
  const bottomRight = latLngToTile(bounds.south, bounds.east, zoom);

  const tiles: TileCoord[] = [];

  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * Baixa um tile específico
 */
async function downloadTile(tile: TileCoord): Promise<boolean> {
  try {
    const TILES_DIR = getTilesDir();
    const url = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
    const fileUri = `${TILES_DIR}${tile.z}/${tile.x}/${tile.y}.png`;

    // Cria diretórios se não existirem
    const dirUri = `${TILES_DIR}${tile.z}/${tile.x}/`;
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }

    // Baixa o tile
    const download = await FileSystem.downloadAsync(url, fileUri);

    if (download.status === 200) {
      console.log(`Downloaded tile: ${tile.z}/${tile.x}/${tile.y}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error downloading tile ${tile.z}/${tile.x}/${tile.y}:`, error);
    return false;
  }
}

/**
 * Baixa todos os tiles das regiões configuradas
 */
export async function downloadOfflineTiles(): Promise<void> {
  console.log('Starting offline tiles download...');

  const TILES_DIR = getTilesDir();

  // Cria diretório principal
  const mainDirInfo = await FileSystem.getInfoAsync(TILES_DIR);
  if (!mainDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(TILES_DIR, { intermediates: true });
  }

  const allTiles: TileCoord[] = [];

  // Gera lista de tiles para cada região e zoom
  for (const region of Object.values(REGIONS)) {
    for (const zoom of ZOOM_LEVELS) {
      const tiles = getTilesForRegion(region.bounds, zoom);
      allTiles.push(...tiles);
      console.log(`Region ${region.name}, zoom ${zoom}: ${tiles.length} tiles`);
    }
  }

  console.log(`Total tiles to download: ${allTiles.length}`);

  // Baixa tiles em lotes de 10 para não sobrecarregar
  const BATCH_SIZE = 10;
  let downloaded = 0;

  for (let i = 0; i < allTiles.length; i += BATCH_SIZE) {
    const batch = allTiles.slice(i, i + BATCH_SIZE);
    const promises = batch.map((tile) => downloadTile(tile));
    
    await Promise.all(promises);
    
    downloaded += batch.length;
    console.log(`Progress: ${downloaded}/${allTiles.length}`);

    // Pequeno delay entre lotes para respeitar o servidor
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Marca como baixado
  await AsyncStorage.setItem(OFFLINE_TILES_KEY, JSON.stringify({
    downloaded: true,
    date: new Date().toISOString(),
    totalTiles: allTiles.length,
    regions: Object.keys(REGIONS),
  }));

  console.log('Offline tiles download completed!');
}

/**
 * Verifica se os tiles offline estão disponíveis
 */
export async function hasOfflineTiles(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_TILES_KEY);
    if (!stored) return false;

    const data = JSON.parse(stored);
    return data.downloaded === true;
  } catch {
    return false;
  }
}

/**
 * Obtém informações sobre os tiles offline
 */
export async function getOfflineTilesInfo(): Promise<any> {
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_TILES_KEY);
    if (!stored) return null;

    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Remove todos os tiles offline
 */
export async function clearOfflineTiles(): Promise<void> {
  try {
    const TILES_DIR = getTilesDir();
    
    // Remove diretório de tiles
    const dirInfo = await FileSystem.getInfoAsync(TILES_DIR);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(TILES_DIR, { idempotent: true });
    }

    // Remove flag de download
    await AsyncStorage.removeItem(OFFLINE_TILES_KEY);

    console.log('Offline tiles cleared');
  } catch (error) {
    console.error('Error clearing offline tiles:', error);
  }
}

/**
 * Obtém URI local de um tile (se existir)
 */
export async function getLocalTileUri(z: number, x: number, y: number): Promise<string | null> {
  try {
    const TILES_DIR = getTilesDir();
    const fileUri = `${TILES_DIR}${z}/${x}/${y}.png`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);

    if (fileInfo.exists) {
      return fileUri;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Calcula tamanho total dos tiles baixados (em MB)
 */
export async function getOfflineTilesSize(): Promise<number> {
  try {
    const TILES_DIR = getTilesDir();
    const dirInfo = await FileSystem.getInfoAsync(TILES_DIR);
    if (!dirInfo.exists) return 0;

    // Função recursiva para calcular tamanho
    async function getDirSize(uri: string): Promise<number> {
      let totalSize = 0;
      
      try {
        const items = await FileSystem.readDirectoryAsync(uri);

        for (const item of items) {
          const itemUri = `${uri}${item}`;
          const itemInfo = await FileSystem.getInfoAsync(itemUri);

          if (itemInfo.exists && itemInfo.isDirectory) {
            totalSize += await getDirSize(`${itemUri}/`);
          } else if (itemInfo.exists) {
            // Estima tamanho médio de tile PNG (30KB)
            totalSize += 30000;
          }
        }
      } catch (error) {
        console.error('Error reading directory:', error);
      }

      return totalSize;
    }

    const sizeBytes = await getDirSize(TILES_DIR);
    return Math.round(sizeBytes / (1024 * 1024)); // Retorna em MB
  } catch (error) {
    console.error('Error calculating tiles size:', error);
    return 0;
  }
}