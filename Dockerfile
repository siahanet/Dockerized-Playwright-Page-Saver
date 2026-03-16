# Use the official Playwright image
FROM mcr.microsoft.com/playwright:v1.50.1-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p outputs sessions

# Expose the uncommon port
EXPOSE 38473

# Default environment variables
ENV PORT=38473
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]
