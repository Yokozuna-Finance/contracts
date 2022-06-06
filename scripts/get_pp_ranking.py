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

class GetPushPowerRanking:
    def __init__(self):
        self.connection = sqlite3.connect("deadnft.db")
        self.cursor = self.connection.cursor()
        self.has_config = False
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
        return receipt

    def _add_dead_nfts(self, deadnfts):
        self.cursor.executemany("insert into deadnft values (?)", deadnfts)
        self.connection.commit()

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
        result = self.cursor.execute("select * from config where label = ? ", (ENV, ),).fetchone()

        if result:
            self.has_config = True
            return {
                'label': result[0], 
                'start': int(result[1]), 
                'rankings': json.loads(result[2])
            }

        else:
            return {
                'label': ENV, 
                'start': 1, 
                'rankings': []
            }

    def _update_config(self, start, rankings):
        if self.has_config == True:
            self.cursor.execute("update config set start = ?, rankings = ? where label = ?", 
                (str(start), json.dumps(rankings), ENV)
            )
        else:
            self.cursor.execute("insert into config values(?, ?, ?)", 
                (ENV, str(start), json.dumps(rankings))
            )
        self.connection.commit()

    def get_updated_rank(self, config):
        deadaddr_nft = []
        new_rank = []
        print(config)
        for rank in config['rankings']:
            # check if current ranking has been fused already
            nft_info = self._get_nft(rank['id'])

            if nft_info is None:
                continue

            if nft_info['owner'] == 'deadaddr':
                deadaddr_nft.append([nft_info['id'],])
            else:
                new_rank.append(rank)

        if deadaddr_nft:
            self._add_dead_nfts(deadaddr_nft)

        return new_rank

    def get_nfts(self):
        deadaddr_nft = []
        config = self._get_config()
        start = config['start']

        nfts = self.get_updated_rank(config);

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

                if nft_info['owner'] == 'deadaddr':
                    deadaddr_nft.append([nft_info['id'],])
                else:
                    nfts.append({'id': nft_info['id'], 'pp': int(nft_info['pushPower'])})

                if nfts:
                    try:
                        nfts = sorted(nfts, key=itemgetter('pp'), reverse=True)
                    except Exception as err:
                        print(nfts)
                        print(err)
                        break
                nfts = nfts[:40]
            start += 1

        if deadaddr_nft:
            self._add_dead_nfts(deadaddr_nft)

        print(">>>>",nfts)
        self._update_config(start, nfts)
        self._save_ranking(nfts)


    def _save_ranking(self, ranking):
        tx = self.iost.create_call_tx(config('NFT_CONTRACT_ID'), 'setNFTRankings', json.dumps(ranking[:20]))
        response = self._execute_tx(tx)



if __name__ ==  "__main__":
    
    pp_rankings = GetPushPowerRanking()
    pp_rankings.get_nfts()
