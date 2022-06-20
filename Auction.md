> Note: Make sure that you have enough zuna token balance for each user.

* Publish NFT contract

    ```
    iwallet --account admin publish NFT.js NFT.js.abi  --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Publish Auction contract

    ```
    iwallet --account admin publish Auction.js Auction.js.abi  --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set NFT contract
    > Note: This will enable the Auction contract to identify which NFT should be listed in the Auction.

    ```
    iwallet --account admin -v call <Auction Contract>  setNFT '["<NFT Contract>"]' -s 18.209.137.246:30002
    ```

* Set the Dao contract
    > Note: Dao contract will receive the 50% fee of the price of the order.

    ```
    iwallet --account admin -v call <Auction Contract>  setDao '["<Dao Contract>"]' -s 18.209.137.246:30002
    ```

* Set the maximum number of order in Auction contract. setMaxOrder '[maxOrder]'
    > Note: The maxOrder should be in number format and only be executed by owner of the Auction contract.

    ```
    iwallet --account admin -v call <Auction Contract>  setMaxOrder '[30]' -s 18.209.137.246:30002
    ```

* Put NFT token id into Auction. Parameters: sale '[NFTtokenId]'
    > Note: NFTtokenId should be in string format. The initial generated NFTs should be put into an Auction while each claim will generate a new mint and should be listed in the Auction list.

    ```
    iwallet --account admin -v call <Auction Contract>  sale '["Yokozuna.1"]' -s 18.209.137.246:30002
    ```

* Bid specific order. Parameters: bid '[orderId, "price"]'

    > Note: orderId should be in number format while the price should be in string format. Bid is also responsible to claim its own expired order.

    ```
    iwallet --account <user> -v call <Auction Contract>  bid '[1,"2"]' --chain_id 1020 -s 18.209.137.246:30002
    ```

* Claim orderId in Auction. Parameters: claim '[orderId]'

    > Note: orderId should be in number format, In this section you can be able to claim it provided you are the current bidder of the expired order.

    ```
    iwallet --account <user> -v call <Auction Contract>  claim '[1]'  -s 18.209.137.246:30002
    ```

* Set the auction date. Parameters: setDate[timestamp]
    > Note: Only the Auction contract owner is allowed to set the date.

    ```
    iwallet --account admin -v call <Auction Contract>  setDate '["0000000000000000000"]' -s 18.209.137.246:30002
    ```

* In case you need to set the fix price. Parameters: setFixPrice['25.00']
    > Note: Only the Auction contract owner is allowed to set the fix price.

    ```
    iwallet --account admin -v call <Auction Contract>  setFixPrice '["25.00"]' -s 18.209.137.246:30002
    ```

* In case you need to set the current price. Parameters: setPriceMultiplier['0.01']
    > Note: Only the Auction contract owner is allowed to set the current price.

    ```
    iwallet --account admin -v call <Auction Contract>  setPriceMultiplier '["0.01"]' -s 18.209.137.246:30002
    ```

* In case you need to set the expiry. Parameters: setExpiry[3600] in seconds
    > Note: Only the Auction contract owner is allowed to set the expiry.

    ```
    iwallet --account admin -v call <Auction Contract>  setExpiry '[3600]' -s 18.209.137.246:30002
    ```
