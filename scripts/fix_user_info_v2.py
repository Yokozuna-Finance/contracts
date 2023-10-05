import ast
import json
import requests
import datetime
import time
import threading

from concurrent import futures
from math import floor
from decouple import config
from base58 import b58decode
from pyost.iost import IOST
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair


class StorageFixer:

    def __init__(self):
        self._setup_account()
        self._setup_server()
        self.staked_users = set()

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


    def _get_user_nft_v1(self, user):
        data = self._get_storage_data(config('NFT_CONTRACT_ID'), 'userNFT', user)
        if data:
            return data
        return []

    def _get_user_nft_v2(self, user):
        key = f'userNFT.{user}'
        data = self._get_storage_data(config('NFT_CONTRACT_ID'), key)
        if data:
            return data
        return []

    def _get_current_id(self):
        return self._get_storage_data(config('NFT_CONTRACT_ID'), 'zid')

    def _get_nft_owner(self, id):
        key = f'zun.{id}'
        return self._get_storage_data(config('NFT_CONTRACT_ID'), key)


    def _get_nft_details(self, id):
        id = str(id).zfill(10)
        key = f'znft.{id}'
        return self._get_storage_data(config('NFT_CONTRACT_ID'), key)

    def _get_user_info_v2(self, user):
        key = f'userInfo.{user}'
        return self._get_storage_data(config('DAO_CONTRACT_ID'), key)

    def _execute_tx(self, tx):
        self.acc.sign_publish(tx)
        receipt = self.iost.send_and_wait_tx(tx)
        return receipt

    def _get_nft(self, id):
        retries = 0
        while True:
            try:
                id_str = str(id).zfill(10)
                details = self._get_nft_details(id_str)
                if details['owner'] != 'deadaddr' and not details['owner'].startswith('Contract'):
                    print(details)
                    self.staked_users.add(details['owner'])
                break
            except Exception as err:
                retries += 1
                time.sleep(1)
                if retries == 5:
                    print(err)
                    print(f"ERROR retrieving data for {id_str}")
                    break

    def process(self):
        current_id = self._get_current_id()
        print('CURRENT_ID:', current_id)

        with futures.ThreadPoolExecutor(max_workers=100) as executor:
            for details in executor.map(self._get_nft, range(1, current_id+1)):
                pass

        for user in self.staked_users:
            if self._get_user_info_v2(user):
                try:
                    tx = self.iost.create_call_tx(config('DAO_CONTRACT_ID'), 'resetUserInfoV2', user)
                    print(f'Calling resetUserInfoV2 for user {user}...')
                    response = self._execute_tx(tx)
                    print(response)
                except Exception as err:
                    print(err)

                

if __name__ ==  "__main__":

    rprocessor = StorageFixer()
    rprocessor.process()
