#!/bin/bash
export PATH="/home/runner/.local/bin:$PATH"

echo "=============================================="
echo "  myWorld Social Contract - Sui Testnet"
echo "=============================================="
echo ""

ACTIVE=$(sui client active-address 2>/dev/null | grep -v warning)
echo "Wallet Address: $ACTIVE"
echo ""

echo "Faucet URL: https://faucet.sui.io/?address=$ACTIVE"
echo ""

echo "Current Balance:"
sui client balance 2>/dev/null | grep -v warning || echo "Unable to fetch balance"
echo ""

echo "---------------------------------------------"
if [ -f deployment_result.txt ]; then
    echo "Deployment Result:"
    cat deployment_result.txt
else
    echo "Status: Contract not yet deployed"
    echo ""
    echo "Steps to deploy:"
    echo "  1. Fund wallet via: https://faucet.sui.io/?address=$ACTIVE"
    echo "  2. Run: bash run_deploy.sh"
fi

echo ""
echo "=============================================="
echo "Explorer: https://testnet.suivision.xyz"
echo "=============================================="

# Keep running, refresh every 30s
while true; do
    sleep 30
    DEPLOYED="NO"
    [ -f deployment_result.txt ] && DEPLOYED="YES"
    echo "[$(date '+%H:%M:%S')] Wallet: $ACTIVE | Deployed: $DEPLOYED"
done
