> Note: Make sure that you have enough zuna token balance for each user.

* Publish Secondary Market contract

    ```
    iwallet --account admin publish Market.js Market.js.abi  --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set NFT contract
    > Note: This will enable the Secondary Market contract to identify which NFT should be listed in Secondary Market.

    ```
    iwallet --account admin -v call <Market Contract>  setNFT '["<NFT Contract>"]' -s 18.209.137.246:30002
    ```

* Set the Dao contract
    > Note: There will be 20% commision fee, the 10% goes to Dao contract and the other 10% goes to dead address for every NFT sold

    ```
    iwallet --account admin -v call <Market Contract>  setDao '["<Dao Contract>"]' -s 18.209.137.246:30002
    ```

* Set the maximum number of sell order in Secondary Market contract. setMaxOrder '[maxOrder]'
    > Note: The maxOrder should be in number format and only be executed by owner of the Auction contract.

    ```
    iwallet --account admin -v call <Market Contract>  setMaxOrder '[30]' -s 18.209.137.246:30002
    ```
