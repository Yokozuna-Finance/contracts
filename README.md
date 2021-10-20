# Setting up Yokozuna Finance smart contracts


## Swap Contract

* Publish SwapPool.js contract and get the Contract ID.

    ```
    iwallet --account yokozuna_admin publish SwapPool.js SwapPool.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Update the StakeTemplate.js and Stake.js and set the YOKOZUNA_TOKEN_SYMBOL.

    > Note: YOKOZUNA_TOKEN_SYMBOL this will be the token to be created, for testing use other token symbol as once we use our token symbol it cannot be undone


## Stake Contract

* Publish StakeTemplate.js and get the Contract ID, we need to do this as when we publish the Stake.js contract we get a timeout error

    > Note: On the contract initialisation, it will create the token and set the dailyDistributionPercentage to 3%, token creation also add the token vaults/pools.


    ```
    iwallet --account yokozuna_admin publish StakeTemplate.js StakeTemplate.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Update the published Stake contract using the Stake.js code

    ```
    iwallet --account yokozuna_admin publish --update Stake.js Stake.js.abi \<Stake Contract ID\> --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the Swap Contract ID, that is being use by the Stake contract.

    ```
    iwallet --account yokozuna_admin -v call \<Stake Contract ID\> setSwap '\["\<Swap Contract ID\>"\]' -s 18.209.137.246:30002
    ```

* Set the Farming start date, date parameter is in unix timestamp format.

    ```
    iwallet --account yokozuna_admin -v call \<Stake Contract I\> setFarmDate '\["1637225321"\]' -s 18.209.137.246:30002
    ```

* Issue token as a part of the initial allocation. 

    ```
    iwallet --account yokozuna_admin -v call \<Stake Contract ID\> issueToken '\["\<address\>", "\<amount\>"\]' -s 18.209.137.246:30002
    ```


