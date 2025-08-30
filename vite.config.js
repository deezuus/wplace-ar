// vite.config.js
import basicSsl from '@vitejs/plugin-basic-ssl'

export default {
  base: '/wplace-ar/',
  plugins: [
    basicSsl({
      /** name of certification */
      name: 'wplace-ar',
    }),
  ],
}