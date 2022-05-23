# Script for getting a snapshot of the users who has staked tokens in IOST and ZUNA Vaults

Vaults included are "iost$27", "iost$87", "zuna$30", "zuna$90"; 

## requirements.txt

Contains script dependency packages.

## iostvaults_snapshot.py

Script for getting a snapshot of the users who has staked tokens in IOST and ZUNA Vaults, also has an option to distribute airdrop to the extracted users. It will save the extracted users to a csv file with the filename provided or it will create a 'users.csv' be default.

To Run:

```
python iostvaults_snapshot.py --help

Get the current user staked in the IOST and ZUNA vaults.

optional arguments:
  -h, --help            show this help message and exit
  -f FILENAME, --filename FILENAME
                        csv output filename, default 'users';
  -m MIN, --min MIN     minimum staked token to qualify for the snapshot list, default 1000;
  -a {get_users,distribute}, --action {get_users,distribute}
                        get the user list or process airdrop distibution, default get_users;
  -t TOKEN_AMOUNT, --token_amount TOKEN_AMOUNT
                        amount of token to be distributed

```

# .env files

These are the settings intended for the different environment we use. To enable just create a symlink of the of the env file to be use to `.env`, for example to use the `.env.local`:

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