> Note: Make sure that NFT Contract is set into Auction Contract

* Upload NFT Contract

    ```
    iwallet --account admin publish NFT.js NFT.js.abi  --gas_limit 4000000 -s 18.209.137.246:30002
    ```
 * Upload Auction Contract

    ```
    iwallet --account admin publish Auction.js Auction.js.abi  --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the NFT contract to be used by the Auction Contract

    ```
    iwallet --account admin -v call <Auction Contract>  setNFT '["<NFT Contract>"]' -s 18.209.137.246:30002
    ```

* Set Maximum number of order. setMaxOrder[maxOrder]

    ```
    iwallet --account admin -v call <Auction Contract>  setMaxOrder '[30]' -s 18.209.137.246:30002
    ```

* Put NFT token id into Auction. Parameters: sale[NFTtokenId]

    ```
    iwallet --account admin -v call <Auction Contract>  sale '[1]' -s 18.209.137.246:30002
    ```

* Bid specific order. Parameters: bid[orderId, NFTtokenId, price]

    ```
    iwallet --account <user> -v call <Auction Contract>  bid '[1,1,"2"]' --chain_id 1020 --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Claim orderId in Auction. Parameters: claim[orderId]

    ```
    iwallet --account <user> -v call <Auction Contract>  claim '[1]'  -s 18.209.137.246:30002
    ```

* In case you want to remove the specific OrderId in Auction. Parameters: claim[orderId]

    ```
    iwallet --account admin -v call <Auction Contract>  unsale '[1]' -s 18.209.137.246:30002
    ```

* In case you want to update the Auction Date. Parameters: setDate[timestamp]

    ```
    iwallet --account admin -v call <Auction Contract>  setDate '["0000000000000000000"]' -s 18.209.137.246:30002
    ```

* In case you need to set the percentage price of newly mint. Parameters: setPricePerMint['0.03']

    ```
    iwallet --account admin -v call <Auction Contract>  setPricePerMint '["0.03"]' -s 18.209.137.246:30002
    ```

* In case you need to set the current price. Parameters: setPrice['1.00']

    ```
    iwallet --account admin -v call <Auction Contract>  setPrice '["1.00"]' -s 18.209.137.246:30002
    ```