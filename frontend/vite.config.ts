import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // 后段走 HTTPS（uvicorn 自签证书，secure: false 跳过代理侧验证）：
      // 密码与 token 在发往后端的链路上加密；生产环境由反向代理终结 TLS
      '/api': {
        target: 'https://localhost:8000',
        secure: false,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'https://localhost:8000',
        secure: false,
      },
    },
  },
})
