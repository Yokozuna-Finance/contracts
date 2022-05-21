* Deploy NFT contract and get the contract ID

```
iwallet --account <user> publish NFT.js NFT.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
```

* Deploy Auction contract and get the contract ID

```
iwallet --account <user> publish NFT.js NFT.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
```

* Update the DAO contract

```
iwallet --account <user> publish --update DAO.js DAO.js.abi ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B --gas_limit 4000000 -s 18.209.137.246:30002
```

* We can use the GeneScience contract we use in staging. 

```
Contract85ipJGukVMJVHxdKkWHAvKsooCkfJUHzsLhML7JwtocZ
```


#### Setting the NFT contract

* Set the GeneScience contract

```
iwallet --account <user> -v call <NFT Contract ID> setGeneScience '["Contract85ipJGukVMJVHxdKkWHAvKsooCkfJUHzsLhML7JwtocZ"]' -s 18.209.137.246:30002
```

* Set the Auction contract

```
iwallet --account <user> -v call <NFT Contract ID> setAuction '["Auction Contract ID"]' -s 18.209.137.246:30002
```

* Set the DAO contract

```
iwallet --account hooda1985 -v call <NFT Contract ID> setDAO '["ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B"]' -s 18.209.137.246:30002
```

* Set Static Image Base URL

```
iwallet --account hooda1985 -v call <NFT Contract ID> setStaticURL '["https://static.yokozuna.fi/"]' -s 18.209.137.246:30002
```

* Set Fusion Fee?? By default fusion fee is 2 zuna

```
iwallet --account hooda1985 -v call <NFT Contract ID> setFusionFee '["<amount>"]' -s 18.209.137.246:30002
```


#### Setting the Auction contract

* Set the NFT contract

```
iwallet --account admin -v call <Auction Contract>  setNFT '["<NFT Contract>"]' -s 18.209.137.246:30002
```

* Set the DAO contract

```
iwallet --account admin -v call <Auction Contract>  setDao '["ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B"]' -s 18.209.137.246:30002
```

* Set the bid expiry??? By default it is set to 600secs or 10mins

```
iwallet --account admin -v call <Auction Contract>  setExpiry '[3600]' -s 18.209.137.246:30002
```


#### Setting the DAO contract

* Set the NFT contract

```
iwallet --account hooda1985 -v call ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B setNFT '["NFT Contract ID"]' -s 18.209.137.246:30002
```

* Set staking start date

```
iwallet --account hooda1985 -v call ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B setStartDate '["<epoch timestamp>"]' -s 18.209.137.246:30002
```

* Set initial pool parameters

```
iwallet --account hooda1985 -v call ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B setPool '[]' -s 18.209.137.246:30002
```
