## DAO Contract

> Note: Make sure that the TOKEN_REWARD in Dao.js defined is correct. We will be using iost in production


* Upload Contract

    ```
    iwallet --account hooda1985 publish Dao.js Dao.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the NFT contract to be used by the DAO Contract.
    
    This is used for token transfer and token info retrieval

    ```
    iwallet --account hooda1985 -v call <DAO Contract ID> setNFT '["NFT Contract ID"]' -s 18.209.137.246:30002
    ```


* Set the Staking start date, date parameter is in unix timestamp format.

    Used for NFT staking.

    ```
    iwallet --account hooda1985 -v call <DAO Contract ID> setStartDate '["1637225321"]' -s 18.209.137.246:30002
    ```


* Set daily token distribution/staking reward.

    By default it is set to 10,000

    ```
    iwallet --account hooda1985 -v call <DAO Contract ID> setDailyDistibution '["5000"]' -s 18.209.137.246:30002
    ```

* Set the initial NFT pool parameters

    Initial NFT pool config

    ```
    iwallet --account hooda1985 -v call <DAO Contract ID> setPool '[]' -s 18.209.137.246:30002
    ```


* Staking

    You can stake up to STAKE_LIMIT tokens. Stake value is based from the push power of the NFT token. 

    ```
    iwallet --account hooda1985 -v call <DAO Contract ID> stake '["<NFT_ID>"]' -s 18.209.137.246:30002
    ```

* Unstaking

    Remove/withdraw staked NFT. 

    ```
    iwallet --account hooda1985 -v call <DAO Contract ID> unstake '["<NFT_ID>""]' -s 18.209.137.246:30002
    ```
