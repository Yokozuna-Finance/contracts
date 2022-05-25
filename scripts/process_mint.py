import json
import requests
import datetime

from math import floor
from decouple import config
from base58 import b58decode
from pyost.iost import IOST
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair

class MinProcessor:

    def __init__(self):
        self._setup_account()
        self._setup_server()

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

    def _get_total_orders(self):
        return self._get_storage_data(config('AUCTION_CONTRACT_ID'),
            'ORDER_DATA.{0}'.format(config('AUCTION_CONTRACT_ID'))).get('orders')

    def _get_order(self, orderId):
        orderId = 'ORDER.{0}'.format(orderId)
        return self._get_storage_data(config('AUCTION_CONTRACT_ID'), orderId)

    def _get_max_order(self):
        return self._get_storage_data(config('AUCTION_CONTRACT_ID'), 'MAX_ORDER_COUNT')

    @property
    def current_date(self):
        return int(datetime.datetime.now().strftime("%s"))

    def _mint_when_order_is_expired(self):
        for orderId in self._get_total_orders():
            order = self._get_order(orderId)
            if (order['expire'] is not None 
                    and (self.current_date > floor(order['expire']/1e9))):
                self._mint()

    def _execute_tx(self, tx):
        self.acc.sign_publish(tx)
        receipt = self.iost.send_and_wait_tx(tx)
        return receipt

    def _mint(self):
        tx = self.iost.create_call_tx(config('NFT_CONTRACT_ID'), 'mint')
        response = self._execute_tx(tx)
        return response

    def _mint_until_max_order_reached(self):
        if (self._get_max_order() > len(self._get_total_orders())):
            try:
                receipts = self._mint().receipts
                for receipt in receipts:
                    print(receipt.func_name, receipt.content)
                print('\n')
            except TimeoutError as err:
                print(err)
                pass
            self._mint_until_max_order_reached()

    def process(self):
        print("Running processNFTMint...")
        self._mint_when_order_is_expired()
        self._mint_until_max_order_reached()

if __name__ ==  "__main__":
    rprocessor = MinProcessor()
    rprocessor.process()
