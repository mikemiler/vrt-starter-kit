# Optional: run the tool in a container (servers, CI, Linux).
# In the workshop we run it directly on the laptop. This is for later.
#
#   docker build -t vrt-starter-kit .
#   docker run --rm -v "$PWD/screenshots:/app/screenshots" -v "$PWD/config.js:/app/config.js" vrt-starter-kit npm run check
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
COPY package*.json ./
RUN npm install --no-fund --no-audit
COPY . .

RUN node -e "const p=require('playwright-core').chromium.executablePath(); require('fs').writeFileSync('/app/.browser-path', p)"
CMD ["sh", "-c", "VRT_BROWSER_PATH=$(cat /app/.browser-path) npm run check"]
