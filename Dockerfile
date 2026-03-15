# Step 1: Build the React app
FROM node:20-slim AS build
WORKDIR /app

# Disable strict engines
ENV NPM_CONFIG_ENGINE_STRICT=false

COPY package*.json ./
RUN npm install

COPY . .

# --- CRITICAL FIX START ---
# These ARGs are populated by the --set-build-env-vars in your deploy script
ARG VITE_GEMINI_API_KEY
ARG VITE_BACKEND_URL

# We manually create the .env file so Vite is GUARANTEED to see them
RUN echo "VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY" > .env
RUN echo "VITE_BACKEND_URL=$VITE_BACKEND_URL" >> .env

# Verify the file exists (for logs)
RUN cat .env
# --- CRITICAL FIX END ---

RUN npx vite build

# Step 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN echo 'server { listen 8080; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]