// Jest setup file
// Add any global test setup here

// Add TextEncoder/TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock performance for Node.js environment
global.performance = global.performance || {
  now: () => Date.now()
};

// Setup crypto mock properly
const nodeCrypto = require('crypto');

// Create a proper crypto mock with subtle object
const mockCrypto = {
  getRandomValues: (array) => {
    const buf = nodeCrypto.randomBytes(array.length);
    for (let i = 0; i < array.length; i++) {
      array[i] = buf[i];
    }
    return array;
  },
  subtle: {
    digest: jest.fn(async (algorithm, data) => {
      const algo = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const hash = nodeCrypto.createHash(algo.toLowerCase().replace('-', ''));
      hash.update(Buffer.from(data));
      const digest = hash.digest();
      return new Uint8Array(digest).buffer;
    }),
    importKey: jest.fn(async (format, keyData, algorithm, extractable, keyUsages) => {
      return {
        type: format === 'raw' ? 'secret' : 'public',
        extractable,
        algorithm: typeof algorithm === 'string' ? { name: algorithm } : algorithm,
        usages: keyUsages || []
      };
    }),
    deriveBits: jest.fn(async (params, key, length) => {
      const salt = Buffer.from(params.salt);
      // Use PBKDF2 to derive bits
      const derived = nodeCrypto.pbkdf2Sync(
        Buffer.from([]), // Will be set by caller
        salt,
        params.iterations || 100000,
        length / 8,
        'sha256'
      );
      return derived.buffer.slice(derived.byteOffset, derived.byteOffset + derived.byteLength);
    }),
    sign: jest.fn(async (algorithm, key, data) => {
      const hmac = nodeCrypto.createHmac('sha1', Buffer.from(data));
      return new Uint8Array(hmac.digest()).buffer;
    }),
    verify: jest.fn(async (algorithm, key, signature, data) => {
      return true;
    })
  }
};

// Set up the global crypto object
global.crypto = mockCrypto;

// Ensure crypto.subtle is properly defined
Object.defineProperty(global.crypto, 'subtle', {
  value: mockCrypto.subtle,
  writable: true,
  configurable: true
});
