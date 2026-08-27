# mantek-functions — Web Push para MANTEK ERP

Cloud Functions que detectan eventos en Firestore (checklist con falla
crítica, equipo fuera de servicio, nueva solicitud, OT asignada, OT
completada, faena en curso abierta 12+ horas) y mandan notificaciones push
a los tokens registrados en `mantek_v2/pushTokens`.

**Cobertura actual: solo Taller (`mantek_v2`).** Marítimo/Dalka/SGN no
disparan push todavía — habría que agregar triggers equivalentes apuntando
a `mantek_maritimo_v1` / `mantek_dalka_v1` / `mantek_sgn_v1` si se quiere
extender.

## Deploy — pasos manuales (una sola vez)

Este proyecto todavía no tiene `firebase.json`/`.firebaserc` en el repo, así
que hace falta inicializar Firebase Functions localmente antes del primer
deploy (con la CLI ya logueada a la cuenta dueña del proyecto Firebase):

```bash
npm install -g firebase-tools     # si no la tenés
firebase login
firebase init functions           # elegir el proyecto real, JavaScript, NO sobreescribir functions/index.js ni package.json
```

1. **Instalar dependencias:**
   ```bash
   cd functions
   npm install
   ```

2. **Llaves VAPID** — ya generadas para este setup (par ECDSA, no dependen
   del proyecto Firebase, se generan una sola vez):
   - Pública: `BGGhuQ3V8F2cPaRMkxgyohLn9A3CTKL0PjCvwdFRxJPjHDnN5xLpkmUtqpBKqmR4NwpWKnLb9_hFxWMh9U7LtDE`
   - Privada: **no está en el repo** — Claude te la pasó directo en el chat
     donde se generaron. Guardala en `functions/.env` (copiá
     `.env.example` a `.env`) o con `firebase functions:config:set`, nunca
     en un archivo commiteado.

   Si preferís generar tu propio par (recomendable si el de arriba se vio
   en un chat que no controlás del todo):
   ```bash
   npx web-push generate-vapid-keys
   ```

3. **Configurar** (elegir UNA de las dos formas — el código lee `.env`
   primero, `functions:config` como respaldo):

   **Opción A — `.env` (recomendado, 2nd-gen friendly):**
   ```bash
   cp .env.example .env
   # completar VAPID_PUBLIC / VAPID_PRIVATE / VAPID_EMAIL / PUSH_SECRET
   ```

   **Opción B — `functions:config` (legacy, requiere firebase-tools <13.x
   con soporte activo del comando):**
   ```bash
   firebase functions:config:set \
     vapid.public="LLAVE_PUBLICA" \
     vapid.private="LLAVE_PRIVADA" \
     vapid.email="mailto:admin@navimag.cl" \
     push.secret="UN_SECRETO_LARGO_Y_UNICO"
   ```

4. **Deploy:**
   ```bash
   firebase deploy --only functions
   ```
   Al terminar, la consola imprime las URLs de `registerPushToken` y
   `sendManualPush`, con la forma:
   `https://us-central1-<PROJECT_ID>.cloudfunctions.net/registerPushToken`

5. **En `App.jsx`**, reemplazar:
   - `VAPID_PUBLIC_KEY` → la llave pública del paso 2.
   - `PUSH_REGISTER_URL` → la URL real de `registerPushToken` del paso 4
     (el placeholder actual asume el project id `erp-mecmar`, inferido del
     nombre del service account en `.gitignore` — **confirmar contra la
     consola de Firebase antes de deployar**, puede no ser el project id
     real).

6. Volver a correr `npm run build` en la raíz del repo y desplegar el
   frontend (Vercel) con esos valores ya puestos.

## Probar sin esperar un evento real

```bash
curl -X POST https://us-central1-<PROJECT_ID>.cloudfunctions.net/sendManualPush \
  -H "Content-Type: application/json" \
  -d '{"title":"Prueba","body":"Hola desde MANTEK","secret":"EL_PUSH_SECRET_QUE_CONFIGURASTE"}'
```

## Reglas de negocio (implementadas en `index.js`)

- Checklist crítico → notifica a supervisor, admin, operaciones.
- Equipo pasa a "falla" → notifica a todos los tokens registrados.
- Nueva solicitud → notifica a supervisor y admin.
- OT asignada → notifica solo al mecánico asignado.
- OT completada (cierre real, `status` pasa a "completada") → notifica a
  TODOS los tokens registrados, con el `data` necesario para que el
  cliente arme un preview (`equipCode`, `observations`, `mec`) cuando quien
  recibe la notificación no tiene acceso a la página de OTs.
- Faena en curso (`mantek_faena/faenas`) sigue con `estado:"activa"` 12+
  horas después de `inicioOp` → notifica a supervisor/admin/operaciones.
  A diferencia de los demás triggers (reaccionan a una escritura), este es
  un `onSchedule` que corre cada hora — el problema acá es el paso del
  tiempo, no un cambio de dato. Avisa UNA sola vez por faena (marca
  `avisoAbiertaEnviado:true` en el doc) mientras siga abierta, para no
  repetir el aviso en cada corrida.
- Tokens que devuelven 410/404 al enviar se borran de `pushTokens`
  automáticamente en la misma llamada.
- Un mismo usuario puede tener un token por dispositivo (`userId+device`),
  así no se pisa el celular con el PC en cada login.
