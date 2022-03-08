# Process IOST Rewards

## requirements.txt

Contains script dependency packages.

## process_rewards.py

This script executes the `processProducerBonus` ABI call and if there are rewards withdrawn,it executes the `distributeProducerBonus` for all the users. To Run:

```
python process_rewards.py
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
    * STAKE_CONTRACT_ID - Staking contract ID
    * USERS_PER_RUN - how many users to process when running the distributeProducerBonus ABI call