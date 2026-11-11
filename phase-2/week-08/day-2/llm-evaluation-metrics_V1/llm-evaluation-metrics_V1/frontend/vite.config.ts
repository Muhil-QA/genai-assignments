import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, rootDir, '')
  
  const frontendPort = env.FRONTEND_PORT ? parseInt(env.FRONTEND_PORT, 10) : 5174
  const backendUrl = env.VITE_API_URL || `http://localhost:${env.PORT || '3002'}`
  
  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      port: frontendPort,
      open: true,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true
        }
      }
    },
    define: {
      'process.env.enableRagas': JSON.stringify(env.enableRagas),
      'process.env.enableDeepEval': JSON.stringify(env.enableDeepEval)
    }
  }
})

