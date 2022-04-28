## NFT Contract

> Note: Make sure that the YOKOZUNA_TOKEN_SYMBOL in NFT.js is the same with YOKOZUNA_TOKEN_SYMBOL in Stake.js


* Upload Contract

    ```
    iwallet --account hooda1985 publish NFT.js NFT.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the GeneSciece contract to be used by the NFT Contract.
    
    This is used for the gene and attribute fusion

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> setGeneScience '["GeneScience Contract ID"]' -s 18.209.137.246:30002
    ```


* Set the Auction contract to be used by the NFT Contract

    Used for NFT token sale/auction

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> setAuction '["Auction Contract ID"]' -s 18.209.137.246:30002
    ```


* Set the DAO contract to be used by the NFT Contract

    Used for NFT fusion

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> setDAO '["DAO Contract ID"]' -s 18.209.137.246:30002
    ```


* Mint / Generate new NFT

    When minting NFT, we use random genes and attributes  from the contract owner's set of NFTs. Same concept of fusion but we dont burn the 2 NFT used for minting. Minting also calls the Auction contract's sale ABI call.

    > Note: You may also need to set the NFT Contract on the Auction Contract by calling the setNFT ABI call

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> mint '[]' -s 18.209.137.246:30002
    ```

* Fuse / Merge NFT

    Fusion is a function that merge 2 NFT to generate a new NFT, resulting with better genes and attributes. 

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> fuse '["<NFT_ID 1>","<NFT_ID 2>"]' -s 18.209.137.246:30002
    ```


* Transfer NFT from one user to the other

    Amount is not being used, we just copy the standard parameters for transfer ABI call.

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> transfer '["<NFT ID>","<User from>","<User to>","<Amount>","<Memo>"]' -s 18.209.137.246:30002
    ```


* Update / Generate NFT Based on the AUCTION_SLOT constant

    If we set the AUCTION_SLOT to 30, and currently we only have 10, when you run this ABI, it will generate/mint 20 new NFTs

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> updateAuctionSlot '[]' -s 18.209.137.246:30002
    ```

* Set the Bid winner as an approver for the NFT so he can claim it.
    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> approve '[<Bid winner>, <NFT ID>]' -s 18.209.137.246:30002
    ```


* Set the all the Bid winners as an approver of the NFT token they won.
    ```
    iwallet --account hooda1985 -v call <NFT Contract ID> approveAll '[]' -s 18.209.137.246:30002
    ```


* Claiming matured NFT
    If we want to claim/withdraw of the NFT token we owned and get the bond price in return. The matured NFT will be unstaked if stake and burned upon claiming.

    ```
    iwallet --account hooda1985 -v call <NFT Contract ID>  claimBond '["<NFT ID>"]' -s 18.209.137.246:30002
    ```

