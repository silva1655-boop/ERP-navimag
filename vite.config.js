import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Versión de este build — se usa para el aviso de "hay una versión nueva"
// dentro de la app (ver App.jsx: chequeo periódico de /version.json contra
// __APP_VERSION__, el valor horneado en este mismo build).
// (commit de prueba — verifica que el aviso de actualización dispare bien)
const BUILD_VERSION = String(Date.now())

// Emite dist/version.json con el mismo valor que __APP_VERSION__ — se sirve
// como archivo estático, así que cada sesión abierta puede consultarlo
// periódicamente sin necesidad de recargar para enterarse de que hay un
// build más nuevo.
function emitVersionJson() {
  return {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD_VERSION }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
})
