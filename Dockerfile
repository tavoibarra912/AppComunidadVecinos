FROM node:24-bookworm-slim
ARG APP_RELEASE=development
ENV APP_RELEASE=$APP_RELEASE
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 APP_DATA_DIR=/app/data APP_UPLOADS_DIR=/app/uploads APP_DEMO_PROFILES=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.js ./
COPY src ./src
COPY public ./public
RUN node -e "require('node:fs').writeFileSync('public/release.json', JSON.stringify({release: process.env.APP_RELEASE}))"
RUN mkdir -p data uploads && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
