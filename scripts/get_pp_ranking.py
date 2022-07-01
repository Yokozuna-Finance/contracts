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

parser = argparse.ArgumentParser(
    prog = 'get_pp_ranking.py',
    description = '',
)

class GetPushPowerRanking:
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


    def _get_staked_user_list(self):
        return self._get_storage_data(config('STAKE_CONTRACT_ID'), 'userBalanceList')


    def _get_staked_nft_list(self, user):
        return self._get_storage_data(config('DAO_CONTRACT_ID'), 'staked.{}'.format(user), '')


    def get_staked_nft(self):
        staked_users = self._get_staked_user_list();

        for user in staked_users:
            self.staked_nfts[user] = self._get_staked_nft_list(user)

    def get_nft_owner(self, nft_id):
        for user in self.staked_nfts.keys():
            if self.staked_nfts[user] and nft_id in self.staked_nfts[user]:
                print(nft_id,':',user)
                return user
        return None

    def get_nfts(self):
        deadaddr_nft = []
        app_config = self._get_config()
        start = app_config['start']
        print(app_config)

        nfts = self.get_updated_rank(app_config);

        #for nft in nfts:
        #    user = self.get_nft_owner(nft['id'])
        #    if user:
        #        nft['owner'] = user

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
                    nfts.append({'id': nft_info['id'], 'pp': int(nft_info['pushPower']), 'owner': nft_info['owner']})

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

        if nfts:
            self._update_config(start, nfts)
            self._save_ranking(nfts)


    def _save_ranking(self, ranking):
        tx = self.iost.create_call_tx(config('NFT_CONTRACT_ID'), 'setNFTRankings', json.dumps(ranking[:20]))
        response = self._execute_tx(tx)


    def get_nft_users(self):
        app_config = self._get_config()

        new_rankings = []
        self.get_staked_nft();

        for rank in app_config['rankings']:
            if rank['owner'] is None or rank['owner'] == config('DAO_CONTRACT_ID'):
                user = self.get_nft_owner(rank['id'])
                rank['owner'] = user
            new_rankings.append(rank)

        print(new_rankings)


    def update_ranking(self, ranking):
        app_config = self._get_config();

        self._update_config(app_config['start'], ranking)


    def get_staked_users(self):
        start = 1
        staked_users = set()
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

        print(list(staked_users))

    def get_user(self, nft_id):
        staked_users = ['h_hbb221', 
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
        'Contract39a35gHkG46g6X1t7xHv6YjkemQDT5YCJxznMy4e5S8t', 
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
        'ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B', 
        'cb3000iost', 
        '86_mh6xfm4m', 
        'cit8laq64rw ', 
        'kongari', 
        'r1hc7_2881', 
        'zerolife', 
        'shotenpa33', 
        'deadaddr', 
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
        'clink_o2ai2']

        for user in staked_users:
            nfts = self._get_staked_nft_list(user)
            #print(user, nfts)
            if nfts and nft_id in nfts:
                print(nft_id, user)
                return user
        

if __name__ ==  "__main__":
    
    print('ENV:', ENV)

    parser.add_argument('-a', '--action',
        help='get the user list or process airdrop distibution',
        default='get_nfts',
        choices=['get_nfts', 'update_ranking']
    )

    args = parser.parse_args()

    pp_rankings = GetPushPowerRanking()
    #
    
    if args.action == 'update_ranking':
    # pp_rankings.get_nft_users()
        rankings = [
        {'id': '0000052915', 'pp': 100000000, 'owner': 'h6hsp44rs3w'}, 
        {'id': '0000049626', 'pp': 51592396, 'owner': 'clink_4x24r'}, 
        {'id': '0000052941', 'pp': 32698803, 'owner': 'topgun'}, 
        {'id': '0000054545', 'pp': 31940700, 'owner': 'clink_4x24r'}, 
        {'id': '0000050233', 'pp': 29680949, 'owner': 'topgun'}, 
        {'id': '0000050977', 'pp': 27843246, 'owner': 'clink_x9wak'}, 
        {'id': '0000055775', 'pp': 26223969, 'owner': 'clink_4x24r'}, 
        {'id': '0000056037', 'pp': 24724992, 'owner': 'clink_x9wak'}, 
        {'id': '0000053716', 'pp': 18103884, 'owner': 'clink_x9wak'}, 
        {'id': '0000040502', 'pp': 10732308, 'owner': 'clink_4x24r'}, 
        {'id': '0000048379', 'pp': 10255317, 'owner': 'clink_4x24r'}, 
        {'id': '0000048926', 'pp': 8377700, 'owner': 'clink_4x24r'}, 
        {'id': '0000047859', 'pp': 7454332, 'owner': 'clink_4x24r'}, 
        {'id': '0000052819', 'pp': 6040662, 'owner': 'chan_16744'}, 
        {'id': '0000049458', 'pp': 4945120, 'owner': 'clink_x9wak'}, 
        {'id': '0000041980', 'pp': 2644338, 'owner': 'clink_4x24r'}, 
        {'id': '0000050916', 'pp': 1771726, 'owner': 'mt81o_3348'}, 
        {'id': '0000019191', 'pp': 1728159, 'owner': 'clink_xvezy'}, 
        {'id': '0000047417', 'pp': 1408506, 'owner': 'ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B'}, 
        {'id': '0000055662', 'pp': 1365490, 'owner': 'kotarawiost'}, 
        {'id': '0000047356', 'pp': 1334736, 'owner': 'golfweekp'}, 
        {'id': '0000044319', 'pp': 1008652, 'owner': 'clink_37yg7'}, 
        {'id': '0000049266', 'pp': 999984, 'owner': 'pong_tawat2'}, 
        {'id': '0000049452', 'pp': 644492, 'owner': 'dear_me95'}, 
        {'id': '0000055946', 'pp': 632308, 'owner': 'kotarawiost'}, 
        {'id': '0000055482', 'pp': 541444, 'owner': 'clink_0eaum'}, 
        {'id': '0000042138', 'pp': 500162, 'owner': 'clink_x9wak'}, 
        {'id': '0000053067', 'pp': 439648, 'owner': 'mt81o_3348'}, 
        {'id': '0000013182', 'pp': 355900, 'owner': 'iostpty'}, 
        {'id': '0000054250', 'pp': 312632, 'owner': 'ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B'}, 
        {'id': '0000048434', 'pp': 269365, 'owner': 'iostdaleast'}, 
        {'id': '0000053331', 'pp': 260127, 'owner': 'mt81o_3348'}, 
        {'id': '0000054772', 'pp': 249972, 'owner': 'clink_d4fvd'}, 
        {'id': '0000052487', 'pp': 220770, 'owner': 'dear_me95'}, 
        {'id': '0000055469', 'pp': 213470, 'owner': 'iostpty'}, 
        {'id': '0000028015', 'pp': 203803, 'owner': 'clink_qojng'}, 
        {'id': '0000041079', 'pp': 137652, 'owner': 'iostpty'}, 
        {'id': '0000032061', 'pp': 134088, 'owner': 'y6809_2806'}, 
        {'id': '0000048721', 'pp': 133910, 'owner': 'takeshi'}, 
        {'id': '0000048583', 'pp': 120139, 'owner': 'ContractCATsN9WGzNZKB87A4hLsVGKXGJWQ7veqWaH6ogkLJX3B'}]
        pp_rankings.update_ranking(rankings)
    else:
        pp_rankings.get_nfts()
    

    # pp_rankings.get_staked_nft()
    # pp_rankings.get_nft_owner('0000041706')
    # pp_rankings.get_user('0000043996')

    # pp_rankings.get_user('0000046329')
    # pp_rankings.get_user('0000046273')

