#!/bin/bash
# One-off: create the keys for phone push notifications and add them to Vercel.
# Run from the MyGuide folder:  bash scripts/setup-push.sh   then   npx vercel@latest --prod
set -e
KEYS=$(node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")
PUB=${KEYS% *}
PRIV=${KEYS#* }
printf '%s' "$PUB" | npx vercel@latest env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
printf '%s' "$PRIV" | npx vercel@latest env add VAPID_PRIVATE_KEY production
echo ""
echo "Push keys added to Vercel. Now publish: npx vercel@latest --prod"
