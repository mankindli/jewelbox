module.exports = {
  port: process.env.PORT || 3004,
  jwtSecret: process.env.JWT_SECRET || 'jewelbox-secret-key-2024',
  jwtExpiresIn: '7d',
  defaultEndpoint: {
    name: '默认端点',
    baseUrl: process.env.API_BASE_URL || 'https://api.zetatechs.com/v1',
    apiKey: process.env.API_KEY || '',
    model: process.env.API_MODEL || 'gemini-3.1-flash-image-preview',
    modelType: 'image'
  },
  upload: {
    maxSize: 10 * 1024 * 1024,
    allowedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  },
  generation: {
    maxConcurrent: 3,
    timeoutMs: 120000,
    maxRetries: 3,
    staleRecoveryMs: 5 * 60 * 1000
  }
};
