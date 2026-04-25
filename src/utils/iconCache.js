import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { logger } from './logger.js';

// CryptoCompare base URL for images
const CC_IMAGE_BASE = 'https://www.cryptocompare.com';

// Local cache directory for icons
const getIconCacheDir = () => (FileSystem.cacheDirectory ?? '') + 'crypto-icons/';

// In-memory cache for icon URIs (avoids repeated filesystem checks)
const memoryCache = {};

// Check if we're on web (no filesystem caching)
const isWeb = Platform.OS === 'web';

/**
 * Ensure the icon cache directory exists
 */
async function ensureCacheDir() {
    if (isWeb) return;
    
    try {
        const iconCacheDir = getIconCacheDir();
        const dirInfo = await FileSystem.getInfoAsync(iconCacheDir);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(iconCacheDir, { intermediates: true });
        }
    } catch (_e) {
        logger.warn('[IconCache] Failed to create cache directory:', _e.message);
    }
}

/**
 * Get the local file path for a coin icon
 */
function getLocalPath(symbol) {
    return getIconCacheDir() + symbol.toUpperCase() + '.png';
}

/**
 * Get the remote URL for a coin icon from CryptoCompare
 */
function getRemoteUrl(symbol, imageUrlPath) {
    if (imageUrlPath) {
        if (imageUrlPath.startsWith('http://') || imageUrlPath.startsWith('https://')) {
            return imageUrlPath;
        }
        const normalizedPath = imageUrlPath.startsWith('/') ? imageUrlPath : `/${imageUrlPath}`;
        return `${CC_IMAGE_BASE}${normalizedPath}`;
    }
    // Stable public icon fallback by symbol.
    return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${String(symbol).toLowerCase()}.png`;
}

export function getIconFallbackUris(symbol, imageUrlPath = null) {
    const sym = String(symbol || '').toLowerCase();
    const candidates = [
        getRemoteUrl(symbol, imageUrlPath),
        `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${sym}.png`,
        `https://cryptoicons.org/api/icon/${sym}/200`,
    ];
    return [...new Set(candidates.filter(Boolean))];
}

/**
 * Synchronous initial icon URI — returns a memory-cached local path or
 * the remote URL derived from imageUrl.  Never touches the filesystem.
 * Used by CoinIcon to avoid the letter-fallback flash on first render.
 */
export function getInitialIconUri(symbol, imageUrlPath = null) {
    const upperSymbol = String(symbol || '').toUpperCase();
    if (memoryCache[upperSymbol]) return memoryCache[upperSymbol];
    if (imageUrlPath) return getRemoteUrl(symbol, imageUrlPath);
    return null;
}

/**
 * Get a cached icon URI, downloading if necessary
 * @param {string} symbol - Coin symbol (e.g., 'BTC')
 * @param {string} imageUrlPath - Optional path from CryptoCompare API (e.g., '/media/44352193/btc.png')
 * @returns {Promise<string>} - Local file URI or remote URL
 */
export async function getCachedIconUri(symbol, imageUrlPath = null) {
    const upperSymbol = symbol.toUpperCase();
    
    // Check memory cache first
    if (memoryCache[upperSymbol]) {
        return memoryCache[upperSymbol];
    }
    
    // On web, just return the remote URL (no local caching)
    if (isWeb) {
        const url = getRemoteUrl(symbol, imageUrlPath);
        memoryCache[upperSymbol] = url;
        return url;
    }
    
    const localPath = getLocalPath(symbol);
    
    try {
        // Check if already cached locally
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        if (fileInfo.exists) {
            memoryCache[upperSymbol] = localPath;
            return localPath;
        }
        
        // Not cached - download it
        await ensureCacheDir();
        
        const remoteUrl = getRemoteUrl(symbol, imageUrlPath);
        
        const downloadResult = await FileSystem.downloadAsync(remoteUrl, localPath);
        
        if (downloadResult.status === 200) {
            memoryCache[upperSymbol] = localPath;
            return localPath;
        } else {
            // Download failed, return remote URL as fallback
            logger.warn(`[IconCache] Failed to download icon for ${symbol}, status: ${downloadResult.status}`);
            memoryCache[upperSymbol] = remoteUrl;
            return remoteUrl;
        }
    } catch (_e) {
        logger.warn(`[IconCache] Error caching icon for ${symbol}:`, _e.message);
        // Return remote URL as fallback
        const remoteUrl = getRemoteUrl(symbol, imageUrlPath);
        memoryCache[upperSymbol] = remoteUrl;
        return remoteUrl;
    }
}

/**
 * Pre-cache icons for multiple symbols
 * @param {Array<{symbol: string, imageUrl?: string}>} coins - Array of coin objects
 */
export async function preCacheIcons(coins) {
    if (isWeb || !coins || coins.length === 0) return;
    
    await ensureCacheDir();
    
    // Download in parallel, but don't wait for all to complete
    const promises = coins.map(async (coin) => {
        try {
            await getCachedIconUri(coin.symbol, coin.imageUrl);
        } catch (_e) {
            // Ignore individual failures
        }
    });
    
    // Wait for all with a timeout
    await Promise.race([
        Promise.all(promises),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
    ]);
}

/**
 * Clear the icon cache
 */
export async function clearIconCache() {
    if (isWeb) {
        Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
        return;
    }
    
    try {
        const iconCacheDir = getIconCacheDir();
        const dirInfo = await FileSystem.getInfoAsync(iconCacheDir);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(iconCacheDir, { idempotent: true });
        }
        // Clear memory cache
        Object.keys(memoryCache).forEach(key => delete memoryCache[key]);
    } catch (_e) {
        logger.warn('[IconCache] Failed to clear cache:', _e.message);
    }
}

/**
 * Get icon cache size in bytes
 */
export async function getIconCacheSize() {
    if (isWeb) return 0;
    
    try {
        const iconCacheDir = getIconCacheDir();
        const dirInfo = await FileSystem.getInfoAsync(iconCacheDir);
        if (!dirInfo.exists) return 0;
        
        const files = await FileSystem.readDirectoryAsync(iconCacheDir);
        let totalSize = 0;
        
        for (const file of files) {
            const fileInfo = await FileSystem.getInfoAsync(iconCacheDir + file);
            if (fileInfo.exists && fileInfo.size) {
                totalSize += fileInfo.size;
            }
        }
        
        return totalSize;
    } catch (_e) {
        return 0;
    }
}


