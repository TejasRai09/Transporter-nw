#!/bin/bash
set -e

echo "============================================"
echo " CaneTransporter — Full Deployment Script"
echo "============================================"

# ─── Phase 1: System Update & Dependencies ───────────────────────────────────
echo ""
echo ">>> [1/10] Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo ">>> [2/10] Installing essentials (git, nginx, curl)..."
sudo apt install -y curl git nginx

echo ">>> [3/10] Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
echo "Node: $(node -v) | NPM: $(npm -v)"

echo ">>> [4/10] Installing MySQL Server..."
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql

# ─── Phase 2: MySQL Setup ────────────────────────────────────────────────────
echo ""
echo ">>> [5/10] Configuring MySQL database..."
sudo mysql -e "
  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'CaneRoot@2026';
  CREATE DATABASE IF NOT EXISTS transpoters CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'caneapp'@'localhost' IDENTIFIED BY 'CaneApp@2026';
  GRANT ALL PRIVILEGES ON transpoters.* TO 'caneapp'@'localhost';
  FLUSH PRIVILEGES;
" 2>/dev/null || echo "(MySQL users may already exist — continuing)"

# ─── Phase 3: Clone Repository ───────────────────────────────────────────────
echo ""
echo ">>> [6/10] Cloning repository..."
cd /home/ubuntu
if [ -d "app" ]; then
  echo "  Directory 'app' already exists. Pulling latest..."
  cd app && git pull origin main || git pull origin master
else
  git clone https://github.com/TejasRai09/Transporter-nw.git app
  cd app
fi

# ─── Phase 4: Backend Setup ──────────────────────────────────────────────────
echo ""
echo ">>> [7/10] Setting up Backend..."
cd /home/ubuntu/app/backend
npm install --production

# Create .env
cat > .env << 'ENVEOF'
DB_HOST=localhost
DB_PORT=3306
DB_USER=caneapp
DB_PASSWORD=CaneApp@2026
DB_NAME=transpoters
PORT=4000
SEED_DEMO=true
NODE_ENV=production
ENVEOF

echo "  Backend .env created."

# Install PM2 globally
echo "  Installing PM2..."
sudo npm install -g pm2

# Start backend with PM2
pm2 delete cane-api 2>/dev/null || true
pm2 start server.js --name "cane-api"
pm2 save

echo "  Backend is running. Testing health..."
sleep 2
curl -s http://localhost:4000/health && echo "" || echo "  (Health check will work after schema creation)"

# ─── Phase 5: Frontend Build ─────────────────────────────────────────────────
echo ""
echo ">>> [8/10] Building Frontend..."
cd /home/ubuntu/app/Studio
npm install

# Set VITE_API_BASE to empty so frontend calls same origin (Nginx proxies to backend)
cat > .env << 'ENVEOF'
VITE_API_BASE=
ENVEOF

npm run build

# Copy build output to web root
sudo mkdir -p /var/www/studio
sudo cp -r dist/* /var/www/studio/
sudo chown -R www-data:www-data /var/www/studio
echo "  Frontend built and deployed to /var/www/studio"

# ─── Phase 6: Nginx Configuration ────────────────────────────────────────────
echo ""
echo ">>> [9/10] Configuring Nginx reverse proxy..."

sudo tee /etc/nginx/sites-available/canetransporter > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    # Serve the React frontend
    root /var/www/studio;
    index index.html;

    # Frontend SPA — all unknown routes fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy backend API routes to Node.js
    location ~ ^/(health|auth|users|transporters|vehicles|reports|logs|seed) {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }

    # Gzip compression for performance
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 256;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
NGINXEOF

sudo ln -sf /etc/nginx/sites-available/canetransporter /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

echo "  Testing Nginx config..."
sudo nginx -t

echo "  Restarting Nginx..."
sudo systemctl restart nginx

# ─── Phase 7: PM2 Auto-Start on Boot ─────────────────────────────────────────
echo ""
echo ">>> [10/10] Configuring PM2 auto-start..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
pm2 save

# ─── Phase 8: Import SQL Dump if available ────────────────────────────────────
if [ -f "/home/ubuntu/app/Dump.sql" ]; then
  echo ""
  echo ">>> Importing Dump.sql into database..."
  mysql -u caneapp -p'CaneApp@2026' transpoters < /home/ubuntu/app/Dump.sql 2>/dev/null || echo "  (Some import warnings — data may already exist)"
  echo "  SQL dump imported."
  # Restart backend to pick up any schema changes
  pm2 restart cane-api
fi

# ─── Done! ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo " ✅ DEPLOYMENT COMPLETE!"
echo "============================================"
echo ""
echo " Your app is live at:"
echo "   🌐  http://52.66.204.143"
echo ""
echo " Backend API:"
echo "   🔗  http://52.66.204.143/health"
echo ""
echo " Default demo login credentials:"
echo "   Admin:   admin / Admin@2026"
echo "   Auditor: auditor / Audit@2026"
echo "   Viewer:  viewer / View@2026"
echo ""
echo " Useful commands:"
echo "   pm2 status              — Check backend"
echo "   pm2 logs cane-api       — View backend logs"
echo "   sudo systemctl status nginx  — Check Nginx"
echo "   sudo tail -f /var/log/nginx/error.log — Nginx errors"
echo ""
echo "============================================"
