#!/bin/bash
export PATH="/home/runner/.local/bin:$PATH"
set -e

echo "=============================================="
echo "  Deploying myWorld Contract to Sui Testnet"
echo "=============================================="
echo ""

ACTIVE=$(sui client active-address 2>/dev/null | grep -v warning)
echo "Active address: $ACTIVE"
echo ""

# Check balance
echo "Current balance:"
BAL=$(sui client balance 2>/dev/null | grep -v warning)
echo "$BAL"

if echo "$BAL" | grep -q "No managed addresses"; then
    echo ""
    echo "ERROR: No wallet configured. Please run setup first."
    exit 1
fi

if echo "$BAL" | grep -q "0 MIST\|No coins found"; then
    echo ""
    echo "ERROR: Wallet has no SUI balance. Please fund your wallet first:"
    echo "  1. Go to: https://faucet.sui.io/?address=$ACTIVE"
    echo "  2. Request testnet SUI tokens"
    echo "  3. Wait 30 seconds, then run this script again"
    exit 1
fi

echo ""
echo "Building contract..."
cd myworld
sui move build 2>&1
echo "Build successful!"
echo ""

echo "Publishing to testnet..."
RESULT=$(sui client publish --gas-budget 100000000 --json 2>&1)
echo "$RESULT"

# Try to parse package ID from JSON output
PACKAGE_ID=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    effects = data.get('effects', {})
    for change in effects.get('mutated', []) + (data.get('objectChanges', [])):
        if isinstance(change, dict) and change.get('type') == 'published':
            print(change.get('packageId', ''))
            break
except:
    pass
" 2>/dev/null)

# Fallback: grep for package ID
if [ -z "$PACKAGE_ID" ]; then
    PACKAGE_ID=$(echo "$RESULT" | grep -oP '"packageId"\s*:\s*"(0x[a-f0-9]+)"' | grep -oP '0x[a-f0-9]+' | head -1)
fi

if [ -n "$PACKAGE_ID" ]; then
    echo ""
    echo "=============================================="
    echo "  Deployment Successful!"
    echo ""
    echo "  Package ID: $PACKAGE_ID"
    echo "  Explorer: https://testnet.suivision.xyz/package/$PACKAGE_ID"
    echo "  SuiScan:  https://suiscan.xyz/testnet/object/$PACKAGE_ID"
    echo "=============================================="

    cat > ../deployment_result.txt << EOF
Deployment Date: $(date)
Network: Sui Testnet
Wallet: $ACTIVE
Package ID: $PACKAGE_ID
Explorer: https://testnet.suivision.xyz/package/$PACKAGE_ID
SuiScan: https://suiscan.xyz/testnet/object/$PACKAGE_ID
EOF
    echo ""
    echo "Results saved to deployment_result.txt"
else
    echo ""
    echo "Deployment ran but could not parse Package ID from output."
    echo "Check the output above for the Package ID."
fi
