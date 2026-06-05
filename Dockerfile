# Use the official Node.js image as the base image.
FROM node:current-alpine3.23
# Set the working directory in the container.
WORKDIR /app
# Copy the package.json and package-lock.json files to the working directory.
COPY package*.json ./
# Install the application dependencies.
RUN npm install
# Copy the rest of the application code to the working directory.
COPY . .

# Build the application.
RUN npm run build

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD ["npm", "run", "start"]