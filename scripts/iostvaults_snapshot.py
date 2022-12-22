import argparse
import csv
import json
import requests

from decouple import config
from base58 import b58decode
import pandas as pd
from pyost.iost import IOST
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair

parser = argparse.ArgumentParser(
    prog = 'iostvaults_snapshot.py',
    description = 'Get the current user staked in the IOST and ZUNA vaults.',
)

VAULTS = ['iost$27', 'iost$87', 'iost$365', 'iost$0']

class Snapshot:
    def __init__(self, minimum_staked=1000, file_name='users'):
        # self._setup_account()
        # self._setup_server();
        self.MINIMUM_STAKED = int(minimum_staked)
        self.FILENAME = file_name
        self.total_staked_iost = 0

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

    def _get_storage_data(self, contract_id, key, field=''):
        resp = requests.post(
            config('STORAGE_URL'),
            json={
                'id': contract_id,
                'key': key,
                'field': field,
                'by_longest_chain': True
            }
        )
        return json.loads(resp.json()['data'])

    def _get_staked_user_list(self):
        return self._get_storage_data(config('STAKE_CONTRACT_ID'), 'userBalanceList')

    def _get_user_info(self, user):
        return self._get_storage_data(config('STAKE_CONTRACT_ID'), 'userInfo', user)

    def _has_staked_iost(self, data, user):
        """
        
        """
        staked_totals = 0
        for vault in VAULTS:
            if data.get(vault, None) and float(data[vault]['amount']) >= self.MINIMUM_STAKED :
                print(user, vault, data[vault]['amount'])
                staked_totals += float(data[vault]['amount'])
                self.total_staked_iost += float(data[vault]['amount'])
        if staked_totals > 0:
            return user, staked_totals
        return False

    def _write_to_file(self, users):
        print("Saving airdrop valid users to {}.csv...".format(self.FILENAME))
        with open('{}.csv'.format(self.FILENAME), 'w') as f: 
            write = csv.writer(f) 
            write.writerows(users)
            write.writerows([['TOTAL_STAKED_IOST', self.total_staked_iost]])

    def _process(self):
        # call processProducerBonus
        print("Running user snapshot for IOST vaults...")
        staked_users = self._get_staked_user_list();

        valid_users = []
        for user in staked_users:
            user_info = self._get_user_info(user)
            stake_iost = self._has_staked_iost(user_info, user)
            if  stake_iost is not False:
                valid_users.append(stake_iost)
        self._write_to_file(valid_users)

    def _execute_tx(self, tx):
        self.acc.sign_publish(tx)
        receipt = self.iost.send_and_wait_tx(tx)
        return receipt

    def _parse_returns(self, receipt):
        return json.loads(json.loads(receipt.returns[0])[0])

    def get_users(self):
        self._process()
        print('Getting user list done!')

    def distribute(self, filename, amount):
        print("Running airdrop distibution of ZUNA NFT from {}.csv file...".format(filename))

        try:
            amount = float(amount)
        except ValueError:
            raise 'Invalid amount.'
        
        self._setup_account()
        self._setup_server()

        df = pd.read_csv("{}.csv".format(filename), names=["User","Amount"])

        last_row = df.iloc[-1]

        timedout_users = []
        for index, user in df.iterrows():
            
            if user['User'] == 'TOTAL_STAKED_IOST':
                pass
            else:
                dist_amount = round((user['Amount'] / last_row['Amount']) * amount, 6)
                
                try: 
                    tx = self.iost.create_call_tx(
                        'token.iost', 
                        'transfer', 
                        'zuna', 
                        config('ACCOUNT'),
                        user['User'],
                        str(dist_amount),
                        'Yokozuna Christmas Airdrop'
                    )
                    response = self._execute_tx(tx)
                    for receipt in response.receipts:
                        print(receipt.func_name, receipt.content)
                except TimeoutError as err:
                    print ('Error:', err)
                    timedout_users.append([user])
                

        if timedout_users:
            with open('{}.csv'.format('timedout_users'), 'w') as f: 
                write = csv.writer(f) 
                write.writerows(timedout_users)

        print('Airdrop distribution done!')

if __name__ ==  "__main__":
    parser.add_argument('-f', '--filename',
        help='csv output filename', 
        default='users'
    )
    parser.add_argument('-m', '--min',
        help='minimum staked token to qualify for the snapshot list',
        default=1000
    )
    parser.add_argument('-a', '--action',
        help='get the user list or process airdrop distibution',
        default='get_users',
        choices=['get_users', 'distribute']
    )

    parser.add_argument('-t', '--token_amount',
        help='total amount of token to be distributed',
        default=250000
    )

    args = parser.parse_args()

    snapshot = Snapshot(args.min, args.filename)
    if args.action == 'distribute':
        getattr(snapshot, args.action)(args.filename, args.token_amount)
    else:
        getattr(snapshot, args.action)()
