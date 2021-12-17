## Governance Contract

> Note: Make sure that the YOKOZUNA_TOKEN_SYMBOL in Governance.js is that same with YOKOZUNA_TOKEN_SYMBOL in Stake.js

* Upload Governance Contract

    ```
    iwallet --account yokozuna_admin publish Governance.js Governance.js.abi --gas_limit 4000000 -s 18.209.137.246:30002
    ```

* Set the Stake contract to be used by the Governance Contract

    ```
    iwallet --account yokozuna_admin -v call <Governance Contract ID> setStake '["<Stake Contract ID>"]' -s 18.209.137.246:30002
    ```

* Adding a proposal, returns the proposalID
    
    ```
    iwallet --account <proposal_owner> -v call <Governance Contract ID> addProposal '["Test Subject", "Test Description"]' -s 18.209.137.246:30002
    ```

* Updating proposal description

    ```
    iwallet --account proposal_owner -v call <Governance Contract ID> changeProposalDescription '["<proposalID>", "Test Description 2"]' -s 18.209.137.246:30002
    ```


* Vote approve to a proposal

    ```
    iwallet --account <user> -v call <Governance Contract ID> approveProposal '["<proposalID>"]' -s 18.209.137.246:30002
    ```

* Vote disapprove to a proposal 

    ```
    iwallet --account <user> -v call <Governance Contract ID> disapproveProposal '["<proposalID>"]' -s 18.209.137.246:30002  
    ```

* Reset a proposal stats, ( for testing purposes only )
    
    ```
    iwallet --account proposal_owner -v call <Governance Contract ID> resetProposal '["<proposalID>"]' -s 18.209.137.246:30002       
    ```

* Once the proposal expires, update the proposal status based on votes if it is approved or rejected 

    ```
    iwallet --account <user> -v call <Governance Contract ID> closeProposal '["<proposalID>"]' -s 18.209.137.246:30002    
    ```

* Used by the contract owner to set the proposal status as implemented, proposal needs to be approved to be implemented. 

    ```
    iwallet --account yokozuna_admin -v call <Governance Contract ID> setProposalAsImplemented '["<proposalID>"]' -s 18.209.137.246:30002    
    ```