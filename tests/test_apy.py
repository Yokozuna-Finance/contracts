import json

from pyost.contract import Contract
from pyost.iost import IOST
from pyost.transaction import TransactionError

from base58 import b58decode, b58encode
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair


class TestAPY:

    def _create_accounts(self):
        # hardcoded acc secret key
        acc_seckey = b58decode(b'2yquS3ySrGWPEKywCPzX4RTJugqRh7kJSo5aehsLYPEWkUxBWA39oMrZ7ZxuM4fgyXYs2cPwh5n8aNNpH5x2VyK1')
        acc_kp = KeyPair(Ed25519, acc_seckey)
        print("SECRET_KEY:", b58encode(acc_kp.seckey))
        self.acc = Account('admin')
        self.acc.add_key_pair(acc_kp, 'active')
        self.acc.add_key_pair(acc_kp, 'owner')

        # hardcoded acc secret key
        acc2_seckey = b58decode(b'2zxFyoNaJj8dqrmeizsdbU6PZwKLaM4xorfKhoMyJ3xuQ7LqFBWkHWBq4q9aXtQiPPhbeZmJwRh96nvVWrivBtwb')
        acc2_kp = KeyPair(Ed25519, acc2_seckey)
        print("SECRET_KEY:", b58encode(acc2_kp.seckey))
        self.acc2 = Account('test2')
        self.acc2.add_key_pair(acc2_kp, 'active')
        self.acc2.add_key_pair(acc2_kp, 'owner')


    def _execute_tx(self, tx):
        #try:
        receipt = self.iost.send_and_wait_tx(tx)
        #except (TransactionError, TimeoutError) as err:
        #    print(err)

        print(receipt)


    def setup_method(self):
        self.swap_contract_id = None
        # hardcoded contract id
        self.stake_contract_id = 'Contract79tUh57dyef1brQLtJtQx7TeQ9X9ufLtdyVdWQqz93HF'
        self.acc = None
        self.acc2 = None
        self.vaults = ['aa63$3',]
        self._create_accounts()

        self.iost = IOST('localhost:30002', chain_id=1020, gas_limit=4000000)
        self.iost.publisher = self.acc

    def test_apy(self):
        print('test_apy');

        for i in range(10000):
            # stake each vault
            for vault in self.vaults:
                tx = self.iost.create_call_tx(self.stake_contract_id, 'stake', vault, '100')
                self.acc.sign_publish(tx)
                self._execute_tx(tx)

            tx = self.iost.create_call_tx(self.stake_contract_id, 'setCounter', str(i + 1))
            self.acc.sign_publish(tx)
            self._execute_tx(tx)
