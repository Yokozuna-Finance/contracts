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

    ```
    iwallet --account yokozuna_admin publish StakeTemplate.js StakeTemplate.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

    > Note: On the contract initialisation, it will create the token, create the token pools/vaults and set the dailyDistributionPercentage to 3%, setting the dailyDistributionPercentage can also be done via ABI call, ei setting daily distribution percentage to 50%

    ```    
    iwallet --account yokozuna_admin -v call <Stake Contract ID> setPercentage '["0.5"]' -s 18.209.137.246:30002
    ``` 


* Update the published Stake contract using the Stake.js code

    ```
    iwallet --account yokozuna_admin publish --update Stake.js Stake.js.abi <Stake Contract ID> --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the Swap Contract ID, that is being use by the Stake contract.

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> setSwap '["<Swap Contract ID>"]' -s 18.209.137.246:30002
    ```

* Set producer name, for iost staking vote network rewards
    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> setProducerName '["metanyx"]' -s 18.209.137.246:30002
    ```


* Set the Farming start date, date parameter is in unix timestamp format.

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> setFarmDate '["1637225321"]' -s 18.209.137.246:30002
    ```

* Issue token as a part of the initial allocation. 

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> issueToken '["<address>", "<amount>"]' -s 18.209.137.246:30002
    ```

* Add pool/vaults for staking. vault parameter should follow this format, \<token\>\_\<days\>, ei: iost_3, for iost token 3 day staking

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPool '["<vault>", "<allocation>", "<minimum stake value>", "true"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPool '["iost_90", "5", "1", "true"]' -s 18.209.137.246:30002    
    ```

* Add pair to vault, this will work if the pair exists in the Swap contract.
    
    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPooltoVault '["<token1>", "<token2>", "<allocation>", "<minimum stake value>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> addPooltoVault '["iost", "metx", "1", "1"]' -s 18.209.137.246:30002
    
    ```


### other ABI calls

* Staking
    
    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> stake '["<vault>", "<amount>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> stake '["iost_90", "100"]' -s 18.209.137.246:30002
    
    ```

* Network rewards processing

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> processProducerBonus '[]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> processProducerBonus '[]' -s 18.209.137.246:30002
    
    ```

* Unstaking
    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> unstake '["<vault>", "<amount>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> unstake '["iost_90", "100"]' -s 18.209.137.246:30002
    
    ```

* Rewards Claiming

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> claim '["<vault>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> claim '["iost_90"]' -s 18.209.137.246:30002
    
    ```

* Vote 

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> vote '["<vault>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> vote '["iost_90"]' -s 18.209.137.246:30002
    
    ```

* Unvote

    ```
    iwallet --account yokozuna_admin -v call <Stake Contract ID> unvote '["<vault>"]' -s 18.209.137.246:30002

    iwallet --account yokozuna_admin -v call <Stake Contract ID> unvote '["iost_90"]' -s 18.209.137.246:30002
    
    ```
