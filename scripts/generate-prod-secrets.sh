#!/bin/bash
# ============================================
# Generate production secrets for Sponsoring Wall
# Run: bash generate-prod-secrets.sh > .env
# ============================================

set -e

echo "# ============================================"
echo "# Sponsoring Wall - Production Environment"
echo "# Generated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "# ============================================"
echo ""

# Generate secure random values
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)
ENC_KEY=$(openssl rand -hex 8)
SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)

echo "# --- Database ---"
echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
echo ""
echo "# --- JWT & Encryption ---"
echo "PROD_JWT_SECRET=${JWT_SECRET}"
echo "PROD_ENC_KEY=${ENC_KEY}"
echo "PROD_SECRET_KEY_BASE=${SECRET_KEY_BASE}"
echo ""
echo "# --- Frontend ---"
echo "# IMPORTANT: After generating this file, run:"
echo "#   node generate-jwt.js"
echo "# to create the VITE_SUPABASE_ANON_KEY using the PROD_JWT_SECRET above."
echo "VITE_SUPABASE_URL=https://api.yourdomain.com"
echo "VITE_SUPABASE_ANON_KEY=REPLACE_WITH_GENERATED_KEY"
echo ""
echo "# --- EmailJS (confirmation emails) ---"
echo "# Sign up at https://www.emailjs.com, create a service + template, then fill in:"
echo "VITE_EMAILJS_SERVICE_ID=REPLACE_WITH_SERVICE_ID"
echo "VITE_EMAILJS_TEMPLATE_ID=REPLACE_WITH_TEMPLATE_ID"
echo "VITE_EMAILJS_PUBLIC_KEY=REPLACE_WITH_PUBLIC_KEY"
echo ""
echo "# --- Domain ---"
echo "DOMAIN=yourdomain.com"
echo ""
echo "# ============================================"
echo "# NEXT STEPS:"
echo "# 1. Edit VITE_SUPABASE_URL with your actual domain"
echo "# 2. Edit DOMAIN with your actual domain"
echo "# 3. Run: node generate-jwt.js  (to create anon key)"
echo "# 4. Replace VITE_SUPABASE_ANON_KEY with the generated key"
echo "# 5. Deploy: docker compose -f docker-compose.prod.yml up -d --build"
echo "# ============================================"
