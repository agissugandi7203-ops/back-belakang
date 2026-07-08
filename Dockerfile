FROM oven/bun:1-alpine

WORKDIR /app

# Salin dependencies manifest
COPY package.json bun.lock ./

# Install dependencies secara clean
RUN bun install --frozen-lockfile

# Salin seluruh source code backend
COPY . .

# Expose port (Cloud Run akan menginjeksi PORT env, bun akan membaca PORT ini)
EXPOSE 3000

# Jalankan backend api server
CMD ["bun", "run", "src/index.ts"]
