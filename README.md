# Setting up Yokozuna Finance smart contracts


## Swap Contract

* Publish SwapPool.js contract and get the Contract ID.

    ```
    iwallet --account yokozuna_admin publish SwapPool.js SwapPool.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```


## Stake Contract

* Update the StakeTemplate.js and Stake.js and set the YOKOZUNA_TOKEN_SYMBOL.

    > Note: YOKOZUNA_TOKEN_SYMBOL this will be the token to be created, for testing use other token symbol as once we use our token symbol it cannot be undone

* Publish StakeTemplate.js and get the Contract ID, we need to do this as when we publish the Stake.js contract we get a timeout error

    > Note: On the contract initialisation, it will create the token and set the dailyDistributionPercentage to 3%, token creation also add the token vaults/pools.


    ```
    iwallet --account yokozuna_admin publish StakeTemplate.js StakeTemplate.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Update the published Stake contract using the Stake.js code

    ```
    iwallet --account yokozuna_admin publish --update Stake.js Stake.js.abi <Stake Contract ID> --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the Swap Contract ID, that is being use by the Stake contract.

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> setSwap '["<Swap Contract ID>"]' -s 18.209.137.246:30002
    ```

* Set the Farming start date, date parameter is in unix timestamp format.

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> setFarmDate '["1637225321"]' -s 18.209.137.246:30002
    ```

* Issue token as a part of the initial allocation. 

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> issueToken '["<address>", "<amount>"]' -s 18.209.137.246:30002
    ```

* Add pool/vaults for staking. token parameter should follow this format, \<token\>\_\<days\>, ei: iost_3, for iost token 3 day staking

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPool '["<pool>", "<allocation>", "<minimum stake value>", "true"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPool '["iost_90", "5", "1", "true"]' -s 18.209.137.246:30002    
    ```

* Add pairs to vault, this will work if pair exists in the Swap contract.
    
    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPooltoVault '["<token1>", "<token2>", "<allocation>", "<minimum stake value>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPooltoVault '["iost", "metx", "1", "1"]' -s 18.209.137.246:30002
    
    ```


