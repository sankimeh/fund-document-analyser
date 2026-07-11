# Use Node 22 Debian-based image
FROM node:22-bookworm-slim

# Set working directory
WORKDIR /app

# Install Python 3, pip, and system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for caching
COPY package*.json ./

# Install Node dependencies
RUN npm ci

# Copy requirements.txt and install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy the rest of the application files
COPY . .

# Build the application
RUN npm run build

# Expose the application port
EXPOSE 3000

# Set environment variable to production
ENV NODE_ENV=production

# Start the application
CMD ["npm", "run", "start"]
