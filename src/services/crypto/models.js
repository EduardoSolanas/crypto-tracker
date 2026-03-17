/**
 * Standard Crypto Price Model
 * @typedef {Object} StandardCryptoModel
 * @property {string} symbol - The crypto symbol (e.g., 'BTC')
 * @property {number} price - Current price in USD
 * @property {number} change24h - 24h Percentage Change
 * @property {number} high24h - 24h High Price in USD
 * @property {number} low24h - 24h Low Price in USD
 * @property {number} mktCap - Market Cap in USD
 * @property {number} vol24h - 24h Volume in USD
 * @property {string|null} imageUrl - URL for coin image
 */

/**
 * Candle Model
 * @typedef {Object} Candle
 * @property {number} time - Unix timestamp in seconds
 * @property {number} open
 * @property {number} high
 * @property {number} low
 * @property {number} close
 */

/**
 * Interface for Crypto Providers
 * @interface ICryptoProvider
 */
/*
  async fetchPrices(symbols: string[]): Promise<Map<string, StandardCryptoModel>>
  async fetchCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>
 */

