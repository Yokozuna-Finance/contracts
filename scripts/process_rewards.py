import json
import requests

from decouple import config
from base58 import b58decode
from pyost.iost import IOST
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair

class RewardsProcessor:
    def __init__(self):
        self._setup_account()
        self._setup_server();
        
    def _setup_server(self):
        self.iost = IOST(
            config('SERVER'),
            chain_id=int(config('CHAIN_ID')),
            gas_limit=int(config('GAS_LIMIT'))
        )
        self.iost.publisher = self.acc

    def _setup_account(self):
        private_key = config('PRIVATE_KEY')
        account_name = config('ACCOUNT')
        acc_seckey = b58decode(private_key.encode('utf-8'))
        acc_kp = KeyPair(Ed25519, acc_seckey)

        self.acc = Account(account_name)
        self.acc.add_key_pair(acc_kp, 'active')
        self.acc.add_key_pair(acc_kp, 'owner')


    def _execute_tx(self, tx):
        #try:
        self.acc.sign_publish(tx)
        receipt = self.iost.send_and_wait_tx(tx)
        #except (TransactionError, TimeoutError) as err:
        #    print(err)
        return json.loads(json.loads(receipt.returns[0])[0])


    def _get_storage_data(self, contract_id, key):
        resp = requests.post(
            config('STORAGE_URL'),
            json={
                'id': contract_id,
                'key': key,
                'field': '',
                'by_longest_chain': True
            }
        )
        return json.loads(resp.json()['data'])


    def _get_total_users(self):
        return len(self._get_storage_data(config('STAKE_CONTRACT_ID'), 'userBalanceList'))


    def process(self):
        # call processProducerBonus
        tx = self.iost.create_call_tx(config('STAKE_CONTRACT_ID'), 'processProducerBonus')
        response = self._execute_tx(tx)
        
        if response[0]:
            # processed = 0
            # total = self._get_total_users()

            while True:
                tx = self.iost.create_call_tx(
                    config('STAKE_CONTRACT_ID'),
                    'distributeProducerBonus',
                    config('USERS_PER_RUN')
                )
                response = self._execute_tx(tx)
                print('Processed user {} of {}...'.format(*response))
                if response[0] == response[1]:
                    break
        else:
            print("Got no response from the voterWithdraw, Terminating..")

if __name__ ==  "__main__":
    rprocessor = RewardsProcessor()
    rprocessor.process()
