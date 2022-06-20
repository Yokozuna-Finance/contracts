import argparse
import csv
import datetime
import json
import requests
from operator import itemgetter
import sqlite3

from decouple import config
from base58 import b58decode
from pyost.iost import IOST
from pyost.account import Account
from pyost.algorithm import Ed25519
from pyost.signature import KeyPair

ENV = 'prod'

class GetStakedUsers:
    def __init__(self):
        self.connection = sqlite3.connect("deadnft.db")
        self.cursor = self.connection.cursor()
        self.has_config = False
        self._setup_account()
        self._setup_server();
        self.staked_nfts = {}
        
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
        return receipt

    def _add_dead_nfts(self, deadnfts):
        try:
            self.cursor.executemany("insert into deadnft values (?)", deadnfts)
            self.connection.commit()
        except:
            print(deadnfts)
            pass

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

    def _get_nft(self, id):
        return self._get_storage_data(config('NFT_CONTRACT_ID'), self._format_nft(id), '')

    def _format_nft(self, id):
        return'znft.%010d' % int(id)

    def _get_config(self):
        label = 'staked_user.{}'.format(ENV)
        result = self.cursor.execute("select * from config where label = ? ", (label, ),).fetchone()

        if result:
            self.has_config = True
            return {
                'label': result[0], 
                'start': int(result[1]), 
                'staked_users': json.loads(result[2])
            }

        else:
            return {
                'label': label, 
                'start': 1, 
                'staked_users': []
            }

    def _update_config(self, start, staked_users):
        label = 'staked_user.{}'.format(ENV)
        if self.has_config == True:
            self.cursor.execute("update config set start = ?, rankings = ? where label = ?", 
                (str(start), json.dumps(staked_users), label)
            )
        else:
            self.cursor.execute("insert into config values(?, ?, ?)", 
                (label, str(start), json.dumps(staked_users))
            )
        self.connection.commit()


    def _get_staked_user_list(self):
        return self._get_storage_data(config('STAKE_CONTRACT_ID'), 'userBalanceList')


    def _get_staked_nft_list(self, user):
        return self._get_storage_data(config('DAO_CONTRACT_ID'), 'staked.{}'.format(user), '')


    def get_staked_nft(self):
        staked_users = self._get_staked_user_list();

        for user in staked_users:
            self.staked_nfts[user] = self._get_staked_nft_list(user)

    def has_staked_nft(self, user):
        if self._get_staked_nft_list(user):
            return True
        return False

    def _get_updated_staked_user_list(self, users):
        staked_users = set()
        for user in users:
            if self.has_staked_nft(user):
                staked_users.add(user)

        return staked_users


    def _save_staked_users(self, staked_users):
        tx = self.iost.create_call_tx(config('DAO_CONTRACT_ID'), 'setStakeUsers', json.dumps(staked_users))
        response = self._execute_tx(tx)


    def update_staked_users(self, start, users):
        self._update_config(start, users)


    def get_staked_users(self):
        app_config = self._get_config();
        start = app_config['start']
        staked_users = _get_updated_staked_user_list(app_config['staked_users'])

        while True:
            nft_id = '%010d' % start;
            rows = self.cursor.execute('select id from deadnft where id = ?', (nft_id,)).fetchall();
            if not rows:
                try:
                    nft_info = self._get_nft(start)
                    print(nft_info)
                except Exception as err:
                    print(err)
                    print(nfts, start)
                    break

                if nft_info is None:
                    break

                staked_users.add(nft_info['owner'])
            start += 1

        staked_users = list(staked_users)
        print(list(staked_users))

        if staked_users:
            self._update_config(start, staked_users)
            self._save_staked_users(staked_users)

        return staked_users

    def get_user(self, nft_id):
        staked_users = [
            'h_hbb221', 
            'vychr_2315', 
            'ghwig28ngsx', 
            'h6hsp44rs3w', 
            'clink_eqlyd', 
            'clink_6veuv', 
            'yannickiost', 
            'mt81o_3348', 
            '2exmww4bj38', 
            'ryuji', 
            'clink_ad4zq', 
            'hoihoi2', 
            'nj3so_2933', 
            'pong_tawat2', 
            'jaguar888', 
            'takeshi', 
            'toolswork', 
            'clink_d4fvd', 
            'clink_fbzgf', 
            'clink_j05wk', 
            'I0st1151', 
            'chan_57488', 
            '1thjx_2897', 
            'chan_05834', 
            '26.05', 
            'iostpty', 
            'ftakao2007', 
            'clink_t0ojj', 
            'aadouyi', 
            'clink_qvdff', 
            'yydouyi', 
            'yuhei', 
            'shehu5083', 
            'clink_09hzx', 
            'cosmonautbe', 
            'metanyx1', 
            'clink_4ziya', 
            'cikara0410', 
            'bmierk', 
            'supertree', 
            'chan_30819', 
            'sq1h5_2455', 
            'nteruth', 
            'ms_dwtxf1hg', 
            'fwoav_2680', 
            'msaiki', 
            '24giLGvX6UhRc82JP5fajQF4adZD3aHNZFmF739vhoyD', 
            'clink_9vam3', 
            'citg78bkb5s', 
            '55', 
            'ymsbv_2787', 
            'garden', 
            'cb3000iost', 
            '86_mh6xfm4m', 
            'cit8laq64rw ', 
            'kongari', 
            'r1hc7_2881', 
            'zerolife', 
            'shotenpa33',
            'hooda1985', 
            'tex_rex2020', 
            'clink_j4trt', 
            'metanyx', 
            'cit8laq64rw', 
            '9z4srs', 
            'ms_qlibuqhg', 
            'm3ynpq4ixv9', 
            'clink_59bi1', 
            'shigemurar', 
            'chan_02894', 
            'clink_cnn1c', 
            'topgun', 
            'chan_80743', 
            '1jvemrygoau', 
            'clink_qojng', 
            'chenlijun', 
            'hufuck', 
            'kotarawiost', 
            'z2yaj_2856', 
            'golfweekp', 
            'dear_me95', 
            'clink_4x24r', 
            'ivios', 
            'clink_yb9kk', 
            '64ce2_2873', 
            '_sgj876p0l9', 
            '30.01', 
            'chan_18247', 
            'clink_x9wak', 
            'clink_vdmsh', 
            'g8qlv_2309', 
            'clink_6qvka', 
            'landies', 
            'clmgu65mh43', 
            'tomoziost', 
            'yautantan', 
            '4vhik_2791', 
            'wynandbucks', 
            'yukiakari3', 
            'clink_o13v7', 
            'adm1j5h6', 
            'zgs3w4k77hr', 
            'anuganu', 
            'clink_ge2lh', 
            'guest_king', 
            'yuuyuu911', 
            'dua02_2851', 
            'clink_o2ai2'
        ]

        staked_u = set()
        for user in staked_users:
            nfts = self._get_staked_nft_list(user)
            if nfts and nft_id in nfts:
                staked_u.add(user)

        print(list(staked_u))

        

if __name__ ==  "__main__":
    
    print('ENV:', ENV)
    pp_rankings = GetStakedUsers()
    # pp_rankings.get_staked_users()
    staked_users = [
            'h_hbb221', 
            'vychr_2315', 
            'ghwig28ngsx', 
            'h6hsp44rs3w', 
            'clink_eqlyd', 
            'clink_6veuv', 
            'yannickiost', 
            'mt81o_3348', 
            '2exmww4bj38', 
            'ryuji', 
            'clink_ad4zq', 
            'hoihoi2', 
            'nj3so_2933', 
            'pong_tawat2', 
            'jaguar888', 
            'takeshi', 
            'toolswork', 
            'clink_d4fvd', 
            'clink_fbzgf', 
            'clink_j05wk', 
            'I0st1151', 
            'chan_57488', 
            '1thjx_2897', 
            'chan_05834', 
            '26.05', 
            'iostpty', 
            'ftakao2007', 
            'clink_t0ojj', 
            'aadouyi', 
            'clink_qvdff', 
            'yydouyi', 
            'yuhei', 
            'shehu5083', 
            'clink_09hzx', 
            'cosmonautbe', 
            'metanyx1', 
            'clink_4ziya', 
            'cikara0410', 
            'bmierk', 
            'supertree', 
            'chan_30819', 
            'sq1h5_2455', 
            'nteruth', 
            'ms_dwtxf1hg', 
            'fwoav_2680', 
            'msaiki', 
            '24giLGvX6UhRc82JP5fajQF4adZD3aHNZFmF739vhoyD', 
            'clink_9vam3', 
            'citg78bkb5s', 
            '55', 
            'ymsbv_2787', 
            'garden', 
            'cb3000iost', 
            '86_mh6xfm4m', 
            'cit8laq64rw ', 
            'kongari', 
            'r1hc7_2881', 
            'zerolife', 
            'shotenpa33',
            'hooda1985', 
            'tex_rex2020', 
            'clink_j4trt', 
            'metanyx', 
            'cit8laq64rw', 
            '9z4srs', 
            'ms_qlibuqhg', 
            'm3ynpq4ixv9', 
            'clink_59bi1', 
            'shigemurar', 
            'chan_02894', 
            'clink_cnn1c', 
            'topgun', 
            'chan_80743', 
            '1jvemrygoau', 
            'clink_qojng', 
            'chenlijun', 
            'hufuck', 
            'kotarawiost', 
            'z2yaj_2856', 
            'golfweekp', 
            'dear_me95', 
            'clink_4x24r', 
            'ivios', 
            'clink_yb9kk', 
            '64ce2_2873', 
            '_sgj876p0l9', 
            '30.01', 
            'chan_18247', 
            'clink_x9wak', 
            'clink_vdmsh', 
            'g8qlv_2309', 
            'clink_6qvka', 
            'landies', 
            'clmgu65mh43', 
            'tomoziost', 
            'yautantan', 
            '4vhik_2791', 
            'wynandbucks', 
            'yukiakari3', 
            'clink_o13v7', 
            'adm1j5h6', 
            'zgs3w4k77hr', 
            'anuganu', 
            'clink_ge2lh', 
            'guest_king', 
            'yuuyuu911', 
            'dua02_2851', 
            'clink_o2ai2'
        ]
    pp_rankings.update_staked_users(54327, staked_users)
