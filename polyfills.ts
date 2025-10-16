import { Buffer } from 'buffer';

// Polyfill global do Buffer para React Native
(globalThis as any).Buffer = Buffer;