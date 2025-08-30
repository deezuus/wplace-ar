// vite.config.js
import basicSsl from '@vitejs/plugin-basic-ssl'

export default {
  plugins: [
    basicSsl({
      /** name of certification */
      name: 'wplace-ar',
    }),
  ],

  server: {
    proxy: {
        '/wplace': {
            target: 'https://backend.wplace.live',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/wplace/, ''),
        }  
    }
  }
}