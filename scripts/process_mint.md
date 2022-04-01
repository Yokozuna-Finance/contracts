# Process NFT mint

## requirements.txt

Contains script dependency packages.

## process_mint.py

This script executes `mint` ABI call and if there are unclaimed order, it executes the `mint` until it fill the maximum order set by the auction contract. To Run:

```
python process_mint.py
```

# .env files

This are the settings intended for the different environment we use. To enable just create a symlink of the of the env file to be use to `.env`, for example to use the `.env.local`:

```
ln -s .env.local .env 
```

## Settings definitions
    
    * SERVER - gRPC server URL 
    * CHAIN_ID - chain id which distinguishes different network
    * GAS_LIMIT - gas limit for a transaction
    * ACCOUNT - which account to use
    * PRIVATE_KEY - account's private key
    * STORAGE_URL - contract storage api endpoint
    * AUCTION_CONTRACT_ID - Auction contract ID
    * NFT_CONTRACT_ID - NFT contract ID
