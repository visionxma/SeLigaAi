const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Adiciona suporte para extensões .cjs e .ts
config.resolver.sourceExts.push('cjs');

module.exports = config;